import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'

const root = resolve(import.meta.dirname, '..')
const DEPLOY_ROOT_PACKAGE = '@deepseek-ai/insight-harness-desktop-runtime'
const DSH_ENTRY = 'node_modules/@deepseek-ai/dsh/lib/bin.js'
const PNPM_ENTRY = 'node_modules/pnpm/bin/pnpm.cjs'

export type DesktopRuntimeTarget = 'darwin-arm64' | 'darwin-x64' | 'win32-x64'

/** Return the pnpm executable name for a host platform. */
export function pnpmCommand(platform: NodeJS.Platform = process.platform): string {
  return platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
}

export interface DesktopRuntimeMetadata {
  schemaVersion: 1
  core: { repository: string; version: string; commit: string }
  entry: string
  node: { version: string }
  pnpm: { version: string }
  target: { platform: NodeJS.Platform; arch: string }
}

export function parseDesktopRuntimeTarget(value: string): {
  platform: NodeJS.Platform
  arch: string
} {
  const [platform, arch] = value.split('-')
  if (
    (platform !== 'darwin' && platform !== 'win32') ||
    (arch !== 'arm64' && arch !== 'x64') ||
    `${platform}-${arch}` !== value
  ) {
    throw new Error(`desktop runtime target must be darwin-arm64, darwin-x64, or win32-x64, got ${JSON.stringify(value)}.`)
  }
  return { platform, arch }
}

export function createDesktopRuntimeMetadata(input: {
  repository: string
  version: string
  commit: string
  nodeVersion: string
  pnpmVersion: string
  target: { platform: NodeJS.Platform; arch: string }
}): DesktopRuntimeMetadata {
  if (!/^[0-9a-f]{40}$/.test(input.commit)) throw new Error('desktop runtime commit must be a 40-character Git SHA.')
  return {
    schemaVersion: 1,
    core: { repository: input.repository, version: input.version, commit: input.commit },
    entry: DSH_ENTRY,
    node: { version: input.nodeVersion },
    pnpm: { version: input.pnpmVersion },
    target: input.target,
  }
}

export async function writeDesktopRuntimeMetadata(
  output: string,
  metadata: DesktopRuntimeMetadata,
): Promise<void> {
  await mkdir(dirname(output), { recursive: true })
  await writeFile(output, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8')
}

export function assertDesktopRuntimeLayout(directory: string, metadata: DesktopRuntimeMetadata): void {
  const nodeExecutable = join(
    directory,
    'node_modules',
    'node',
    'bin',
    metadata.target.platform === 'win32' ? 'node.exe' : 'node',
  )
  for (const path of [join(directory, metadata.entry), join(directory, PNPM_ENTRY), nodeExecutable]) {
    if (!existsSync(path)) throw new Error(`desktop runtime is missing ${path}.`)
  }
}

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit', windowsHide: true })
    child.once('error', reject)
    child.once('exit', code => code === 0 ? resolvePromise() : reject(new Error(`${command} exited with code ${code ?? 'unknown'}.`)))
  })
}

async function packageVersion(path: string, field: 'version' | 'packageManager'): Promise<string> {
  const value: unknown = JSON.parse(await readFile(path, 'utf8'))
  if (!value || typeof value !== 'object') throw new Error(`${path} is not a package manifest.`)
  const fieldValue = (value as Record<string, unknown>)[field]
  if (typeof fieldValue !== 'string' || fieldValue === '') throw new Error(`${path} has no ${field}.`)
  return fieldValue
}

async function gitCommit(): Promise<string> {
  const { stdout } = await new Promise<{ stdout: string }>((resolvePromise, reject) => {
    let stdout = ''
    const child = spawn('git', ['rev-parse', 'HEAD'], { cwd: root, stdio: ['ignore', 'pipe', 'inherit'] })
    child.stdout.on('data', (chunk) => { stdout += String(chunk) })
    child.once('error', reject)
    child.once('exit', code => code === 0 ? resolvePromise({ stdout }) : reject(new Error('git rev-parse HEAD failed.')))
  })
  return stdout.trim()
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      target: { type: 'string' },
      output: { type: 'string', default: 'dist/runtime' },
      'skip-build': { type: 'boolean', default: false },
    },
  })
  if (values.target === undefined) throw new Error('usage: pnpm run runtime:assemble -- --target <target> [--output <directory>] [--skip-build]')
  const target = parseDesktopRuntimeTarget(values.target)
  if (target.platform !== process.platform || target.arch !== process.arch) {
    throw new Error(`desktop runtime target ${values.target} requires ${target.platform}/${target.arch}; current host is ${process.platform}/${process.arch}.`)
  }
  const output = resolve(root, values.output)
  if (!values['skip-build']) await run(pnpmCommand(), ['run', 'build:official'])
  await rm(output, { recursive: true, force: true })
  await run(pnpmCommand(), [
    '--filter', DEPLOY_ROOT_PACKAGE, 'deploy', '--legacy', '--prod',
    '--config.node-linker=hoisted', '--config.auto-install-peers=false',
    '--config.link-workspace-packages=true', output,
  ])
  const [version, packageManager, commit] = await Promise.all([
    packageVersion(join(root, 'package.json'), 'version'),
    packageVersion(join(root, 'package.json'), 'packageManager'),
    gitCommit(),
  ])
  const metadata = createDesktopRuntimeMetadata({
    repository: 'Boxser567/insight-harness-core',
    version,
    commit,
    nodeVersion: await packageVersion(join(output, 'node_modules', 'node', 'package.json'), 'version'),
    pnpmVersion: packageManager.replace(/^pnpm@/, ''),
    target,
  })
  assertDesktopRuntimeLayout(output, metadata)
  await writeDesktopRuntimeMetadata(join(output, 'runtime.json'), metadata)
  console.log(`desktop runtime assembled: ${output}`)
}

if (import.meta.main) await main()
