/** Archive one assembled desktop Runtime and record its immutable release facts. */

import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { parseDesktopRuntimeTarget } from './desktop-runtime-artifact.ts'

const root = resolve(import.meta.dirname, '..')

/** Return the asset basename for one Core version and desktop target. */
export function desktopRuntimeArchiveName(version: string, target: string): string {
  parseDesktopRuntimeTarget(target)
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`desktop runtime version must be semver-like, got ${JSON.stringify(version)}.`)
  }
  return `insight-harness-runtime-${version}-${target}.tar.gz`
}

/** Render the checksum sidecar consumed by the desktop Shell. */
export function desktopRuntimeChecksumLine(filename: string, digest: string): string {
  if (!/^[0-9a-f]{64}$/.test(digest)) throw new Error('desktop runtime SHA-256 must be lowercase hexadecimal.')
  return `${digest}  ${filename}\n`
}

/** Compute a file's SHA-256 digest. */
export async function sha256(path: string): Promise<string> {
  return createHash('sha256').update(await readFile(path)).digest('hex')
}

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit', windowsHide: true })
    child.once('error', reject)
    child.once('exit', (code) => {
      if (code === 0) resolvePromise()
      else reject(new Error(`${command} exited with code ${code ?? 'unknown'}.`))
    })
  })
}

async function runtimeVersion(runtimeDirectory: string): Promise<string> {
  const metadata: unknown = JSON.parse(await readFile(join(runtimeDirectory, 'runtime.json'), 'utf8'))
  if (!metadata || typeof metadata !== 'object') throw new Error('desktop runtime metadata is invalid.')
  const core = (metadata as { core?: unknown }).core
  if (!core || typeof core !== 'object' || typeof (core as { version?: unknown }).version !== 'string') {
    throw new Error('desktop runtime metadata has no Core version.')
  }
  return (core as { version: string }).version
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      target: { type: 'string' },
      out: { type: 'string', default: 'dist/runtime-release' },
      'skip-build': { type: 'boolean', default: false },
    },
  })
  if (values.target === undefined) throw new Error('usage: pnpm run runtime:package -- --target <target> [--out <directory>] [--skip-build]')
  const target = parseDesktopRuntimeTarget(values.target)
  const targetName = `${target.platform}-${target.arch}`
  const destination = resolve(root, values.out)
  const runtimeDirectory = join(destination, 'runtime')
  await rm(destination, { recursive: true, force: true })
  await mkdir(destination, { recursive: true })
  const assembleArgs = ['--import', 'tsx/esm', 'scripts/desktop-runtime-artifact.ts', '--target', targetName, '--output', runtimeDirectory]
  if (values['skip-build']) assembleArgs.push('--skip-build')
  await run(process.execPath, assembleArgs)

  const filename = desktopRuntimeArchiveName(await runtimeVersion(runtimeDirectory), targetName)
  const archive = join(destination, filename)
  await run('tar', ['-czf', archive, '-C', runtimeDirectory, '.'])
  const digest = await sha256(archive)
  await writeFile(join(destination, `${filename}.sha256`), desktopRuntimeChecksumLine(filename, digest), 'utf8')
  await writeFile(join(destination, `${filename}.json`), await readFile(join(runtimeDirectory, 'runtime.json')))
  console.log(`desktop runtime packaged: ${basename(archive)}`)
}

if (import.meta.main) await main()
