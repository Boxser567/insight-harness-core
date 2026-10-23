import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { cp, mkdir, readdir, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'
import { dump, load } from 'js-yaml'

const root = resolve(import.meta.dirname, '..')
const DEPLOY_ROOT_PACKAGE = '@deepseek-ai/insight-harness-desktop-runtime'
const DSH_ENTRY = 'node_modules/@deepseek-ai/dsh/lib/bin.js'
const PNPM_ENTRY = 'node_modules/pnpm/bin/pnpm.cjs'
const DESKTOP_HMR_FALLBACK = 'dsh-desktop-hmr-fallback'

export type DesktopRuntimeTarget = 'darwin-arm64' | 'darwin-x64' | 'win32-x64'

/** Return the pnpm invocation required by a host platform. */
export function pnpmInvocation(platform: NodeJS.Platform = process.platform): {
  command: string
  shell: boolean
} {
  return platform === 'win32' ? { command: 'pnpm.cmd', shell: true } : { command: 'pnpm', shell: false }
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
  for (const path of [
    join(directory, metadata.entry),
    join(directory, PNPM_ENTRY),
    nodeExecutable,
    join(directory, 'node_modules', '@deepseek-ai', 'dsh-client-ui-slots', 'package.json'),
    join(directory, 'node_modules', '@deepseek-ai', 'dsh-client-ui-slots', 'lib', 'types', 'index.d.ts'),
  ]) {
    if (!existsSync(path)) throw new Error(`desktop runtime is missing ${path}.`)
  }
}

/**
 * Verify required workspace peers from the deployed package locations.
 * @param directory - Hoisted production Runtime root.
 * @returns Resolution after every required peer can be resolved.
 * @throws When a deployed package has a missing required workspace peer.
 */
export async function assertDesktopRuntimePeers(directory: string): Promise<void> {
  const scope = join(directory, 'node_modules', '@deepseek-ai')
  for (const name of await readdir(scope)) {
    const manifestPath = join(scope, name, 'package.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
      name: string
      peerDependencies?: Record<string, string>
      peerDependenciesMeta?: Record<string, { optional?: boolean }>
    }
    const require = createRequire(manifestPath)
    for (const peer of Object.keys(manifest.peerDependencies ?? {})) {
      if (!peer.startsWith('@deepseek-ai/') || manifest.peerDependenciesMeta?.[peer]?.optional) continue
      try { require.resolve(`${peer}/package.json`) } catch (cause) {
        throw new Error(`desktop runtime: ${manifest.name} requires missing peer ${peer}`, { cause })
      }
    }
  }
}

function run(command: string, args: string[], shell = false): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd: root, shell, stdio: 'inherit', windowsHide: true })
    child.once('error', reject)
    child.once('exit', (code) => {
      if (code === 0) resolvePromise()
      else reject(new Error(`${command} exited with code ${code ?? 'unknown'}.`))
    })
  })
}

function runPnpm(args: string[]): Promise<void> {
  const pnpmScript = process.env.npm_execpath
  if (pnpmScript !== undefined && pnpmScript !== '') {
    // Keep the package manager on the same Node binary that launched this
    // script. Core's runtime deploy is memory-sensitive on large alpha
    // workspaces, and a PATH-resolved Corepack shim may select an older Node.
    return run(process.execPath, [pnpmScript, ...args])
  }
  const { command, shell } = pnpmInvocation()
  return run(command, args, shell)
}

/**
 * Approve the same reviewed workspace postinstall under deploy's file URL identity.
 * @param output - Deployed Runtime root.
 * @returns Completion after updating only the reviewed script's approval.
 */
export async function approveDeployedSubprocessBuild(output: string): Promise<void> {
  const path = join(output, 'pnpm-workspace.yaml')
  const settings = load(await readFile(path, 'utf8')) as { allowBuilds?: Record<string, boolean> }
  const source = '@deepseek-ai/dsh-subprocess-local@file:packages/subprocess/subprocess-local'
  if (settings.allowBuilds?.[source] !== true) throw new Error('desktop runtime subprocess postinstall is not approved.')
  delete settings.allowBuilds['@deepseek-ai/dsh-subprocess-local@file:packages/subprocess/subprocess-local']
  settings.allowBuilds[`@deepseek-ai/dsh-subprocess-local@${pathToFileURL(join(root, 'packages/subprocess/subprocess-local')).href}`] = true
  await writeFile(path, dump(settings), 'utf8')
}

/**
 * Reject any dependency lifecycle script that rebuild left without an approval.
 * @param output - Deployed Runtime root.
 * @returns Completion after the strict build policy has been checked.
 */
export async function assertDesktopRuntimeBuilds(output: string): Promise<void> {
  const state = load(await readFile(join(output, 'node_modules/.modules.yaml'), 'utf8')) as { ignoredBuilds?: string[] }
  if (state.ignoredBuilds?.length) throw new Error(`desktop runtime has unapproved builds: ${state.ignoredBuilds.join(', ')}`)
}

async function packageVersion(path: string, field: 'version' | 'packageManager'): Promise<string> {
  const value: unknown = JSON.parse(await readFile(path, 'utf8'))
  if (!value || typeof value !== 'object') throw new Error(`${path} is not a package manifest.`)
  const fieldValue = (value as Record<string, unknown>)[field]
  if (typeof fieldValue !== 'string' || fieldValue === '') throw new Error(`${path} has no ${field}.`)
  return fieldValue
}

export async function addDesktopHmrFallback(output: string): Promise<void> {
  const packageDirectory = join(root, 'runtime', 'desktop', DESKTOP_HMR_FALLBACK)
  const destination = join(output, 'node_modules', DESKTOP_HMR_FALLBACK)
  await cp(packageDirectory, destination, { recursive: true })
  const dshPackagePath = join(output, 'node_modules', '@deepseek-ai', 'dsh', 'package.json')
  const dshPackage = JSON.parse(await readFile(dshPackagePath, 'utf8')) as {
    dependencies?: Record<string, string>
  }
  dshPackage.dependencies = { ...dshPackage.dependencies, [DESKTOP_HMR_FALLBACK]: '0.1.0' }
  const stagingPath = `${dshPackagePath}.desktop-tmp`
  await writeFile(stagingPath, `${JSON.stringify(dshPackage, null, 2)}\n`, 'utf8')
  await rename(stagingPath, dshPackagePath)
}

async function gitCommit(): Promise<string> {
  const { stdout } = await new Promise<{ stdout: string }>((resolvePromise, reject) => {
    let stdout = ''
    const child = spawn('git', ['rev-parse', 'HEAD'], { cwd: root, stdio: ['ignore', 'pipe', 'inherit'] })
    child.stdout.on('data', (chunk) => { stdout += String(chunk) })
    child.once('error', reject)
    child.once('exit', (code) => {
      if (code === 0) resolvePromise({ stdout })
      else reject(new Error('git rev-parse HEAD failed.'))
    })
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
  if (!values['skip-build']) await runPnpm(['run', 'build:official'])
  await rm(output, { recursive: true, force: true })
  await runPnpm([
    '--filter', DEPLOY_ROOT_PACKAGE, 'deploy', '--prod', '--ignore-scripts',
    '--config.node-linker=hoisted', '--config.allowUnusedPatches=true',
    '--child-concurrency=1', '--network-concurrency=1', output,
  ])
  await approveDeployedSubprocessBuild(output)
  await runPnpm(['--dir', output, '--config.node-linker=hoisted', 'rebuild'])
  await assertDesktopRuntimeBuilds(output)
  if (target.platform !== 'win32') {
    // node-bin-setup creates an absolute shim that cannot survive relocation.
    const shim = join(output, 'node_modules/.bin/node')
    await rm(shim, { force: true })
    await symlink('../node/bin/node', shim)
  }
  await addDesktopHmrFallback(output)
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
  await assertDesktopRuntimePeers(output)
  assertDesktopRuntimeLayout(output, metadata)
  await writeDesktopRuntimeMetadata(join(output, 'runtime.json'), metadata)
  console.log(`desktop runtime assembled: ${output}`)
}

if (import.meta.main) await main()
