import { link, lstat, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  addDesktopHmrFallback,
  assertDesktopRuntimeLayout,
  assertDesktopRuntimePeers,
  createDesktopRuntimeMetadata,
  materializeVendoredPackages,
  parseDesktopRuntimeTarget,
  pnpmInvocation,
} from './desktop-runtime-artifact.ts'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

describe('desktop runtime artifact metadata', () => {
  it('records a fixed Core identity and target', () => {
    expect(createDesktopRuntimeMetadata({
      repository: 'Boxser567/insight-harness-core',
      version: '0.1.1-rc.2',
      commit: 'a'.repeat(40),
      nodeVersion: '24.9.0',
      pnpmVersion: '11.7.0',
      target: { platform: 'darwin', arch: 'arm64' },
    })).toEqual({
      schemaVersion: 1,
      core: { repository: 'Boxser567/insight-harness-core', version: '0.1.1-rc.2', commit: 'a'.repeat(40) },
      entry: 'node_modules/@deepseek-ai/dsh/lib/bin.js',
      node: { version: '24.9.0' },
      pnpm: { version: '11.7.0' },
      target: { platform: 'darwin', arch: 'arm64' },
    })
  })

  it('rejects an unsupported target or non-immutable commit', () => {
    expect(() => parseDesktopRuntimeTarget('linux-arm64')).toThrow('desktop runtime target')
    expect(() => createDesktopRuntimeMetadata({
      repository: 'Boxser567/insight-harness-core', version: '0.1.1-rc.2', commit: 'short',
      nodeVersion: '24.9.0', pnpmVersion: '11.7.0', target: { platform: 'darwin', arch: 'arm64' },
    })).toThrow('40-character Git SHA')
  })

  it('runs the Windows pnpm command through a shell', () => {
    expect(pnpmInvocation('darwin')).toEqual({ command: 'pnpm', shell: false })
    expect(pnpmInvocation('win32')).toEqual({ command: 'pnpm.cmd', shell: true })
  })

  it('requires the client slot type contract in the deployed layout', async () => {
    const output = await mkdtemp(join(tmpdir(), 'desktop-runtime-artifact-'))
    temporaryDirectories.push(output)
    const metadata = createDesktopRuntimeMetadata({
      repository: 'Boxser567/insight-harness-core',
      version: '0.1.1-rc.2',
      commit: 'a'.repeat(40),
      nodeVersion: '24.9.0',
      pnpmVersion: '11.7.0',
      target: { platform: 'darwin', arch: 'arm64' },
    })
    for (const path of [
      join(output, metadata.entry),
      join(output, 'node_modules', 'pnpm', 'bin', 'pnpm.cjs'),
      join(output, 'node_modules', 'node', 'bin', 'node'),
    ]) {
      await mkdir(join(path, '..'), { recursive: true })
      await writeFile(path, '')
    }

    expect(() => { assertDesktopRuntimeLayout(output, metadata) }).toThrow('dsh-client-ui-slots/package.json')
    const slots = join(output, 'node_modules', '@deepseek-ai', 'dsh-client-ui-slots')
    await mkdir(slots, { recursive: true })
    await writeFile(join(slots, 'package.json'), '{}\n')
    expect(() => { assertDesktopRuntimeLayout(output, metadata) }).toThrow('dsh-client-ui-slots/lib/types/index.d.ts')
    await mkdir(join(slots, 'lib', 'types'), { recursive: true })
    await writeFile(join(slots, 'lib', 'types', 'index.d.ts'), '')
    expect(() => { assertDesktopRuntimeLayout(output, metadata) }).not.toThrow()
  })

  it('adds the desktop HMR fallback to the deployed DSH dependency graph', async () => {
    const output = await mkdtemp(join(tmpdir(), 'desktop-runtime-artifact-'))
    temporaryDirectories.push(output)
    const dshDirectory = join(output, 'node_modules', '@deepseek-ai', 'dsh')
    await mkdir(dshDirectory, { recursive: true })
    await writeFile(join(dshDirectory, 'package.json'), '{"dependencies":{}}\n')

    await addDesktopHmrFallback(output)

    const dshPackage = JSON.parse(await readFile(join(dshDirectory, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>
    }
    expect(dshPackage.dependencies['dsh-desktop-hmr-fallback']).toBe('0.1.0')
    expect(await readFile(join(output, 'node_modules', 'dsh-desktop-hmr-fallback', 'index.js'), 'utf8')).toContain(
      "export const name = 'dsh-desktop-hmr-fallback'",
    )
  })

  it('replaces deployed vendor workspace links and their nested dependencies with runtime files', async () => {
    const output = await mkdtemp(join(tmpdir(), 'desktop-runtime-artifact-'))
    temporaryDirectories.push(output)
    const destination = join(output, 'node_modules', '@deepseek-ai', 'schemastery')
    await mkdir(join(destination, '..'), { recursive: true })
    await symlink('/missing/vendor/schemastery', destination)

    await materializeVendoredPackages(output)

    expect(JSON.parse(await readFile(join(destination, 'package.json'), 'utf8'))).toMatchObject({
      name: '@deepseek-ai/schemastery',
    })
    expect(await readFile(join(destination, 'src', 'index.ts'), 'utf8')).toContain('Schema')
    expect((await lstat(join(destination, 'node_modules', '@deepseek-ai', 'cosmokit'))).isSymbolicLink()).toBe(false)
    expect((await lstat(join(destination, 'node_modules', '@standard-schema', 'spec'))).isSymbolicLink()).toBe(false)
  })
})


it('rejects a deploy missing required peers while permitting absent optional peers', async () => {
  const output = await mkdtemp(join(tmpdir(), 'desktop-runtime-peers-'))
  temporaryDirectories.push(output)
  const packagePath = join(output, 'node_modules/@deepseek-ai/dsh-fixture')
  const requiredPath = join(output, 'node_modules/@deepseek-ai/dsh-required')
  await mkdir(packagePath, { recursive: true })
  await writeFile(join(packagePath, 'package.json'), JSON.stringify({
    name: '@deepseek-ai/dsh-fixture',
    peerDependencies: { '@deepseek-ai/dsh-required': '*', '@deepseek-ai/dsh-optional': '*' },
    peerDependenciesMeta: { '@deepseek-ai/dsh-optional': { optional: true } },
  }))
  await expect(assertDesktopRuntimePeers(output)).rejects.toThrow('requires missing peer @deepseek-ai/dsh-required')
  await mkdir(requiredPath, { recursive: true })
  await writeFile(join(requiredPath, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-required' }))
  await expect(assertDesktopRuntimePeers(output)).resolves.toBeUndefined()
})


it('keeps workspace manifests unchanged when deploy uses hard links', async () => {
  const output = await mkdtemp(join(tmpdir(), 'desktop-runtime-hardlink-'))
  temporaryDirectories.push(output)
  const source = join(output, 'source-package.json')
  const manifest = JSON.stringify({ name: '@deepseek-ai/dsh', dependencies: {} })
  await writeFile(source, manifest)
  const deployed = join(output, 'node_modules/@deepseek-ai/dsh')
  await mkdir(deployed, { recursive: true })
  await link(source, join(deployed, 'package.json'))
  await addDesktopHmrFallback(output)
  expect(await readFile(source, 'utf8')).toBe(manifest)
  const patched = JSON.parse(await readFile(join(deployed, 'package.json'), 'utf8')) as { dependencies: Record<string, string> }
  expect(patched.dependencies['dsh-desktop-hmr-fallback']).toBe('0.1.0')
})
