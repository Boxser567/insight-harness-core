import { spawnSync } from 'node:child_process'
import { link, mkdtemp, mkdir, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { globSync } from 'node:fs'
import { delimiter, dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { load } from 'js-yaml'
import { afterEach, describe, expect, it } from 'vitest'
import { assertRuntimeLinks } from './verify-desktop-runtime.mjs'
import {
  addDesktopHmrFallback,
  approveDeployedSubprocessBuild,
  assertDesktopRuntimeBuilds,
  assertDesktopRuntimeLayout,
  assertDesktopRuntimePeers,
  createDesktopRuntimeMetadata,
  parseDesktopRuntimeTarget,
  pnpmInvocation,
  removeDesktopRuntimeNodeShims,
} from './desktop-runtime-artifact.ts'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

describe('desktop runtime artifact metadata', () => {
  it('keeps the Runtime dependency root aligned with the current workspace and package manager', async () => {
    const root = resolve(import.meta.dirname, '..')
    const manifest = JSON.parse(await readFile(join(root, 'runtime/desktop/package.json'), 'utf8'))
    const workspace = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
    const names = new Set(await Promise.all(
      [...globSync(['packages/*/*/package.json', 'vendor/*/package.json', 'apps/*/package.json'], { cwd: root })]
        .map(async path => JSON.parse(await readFile(join(root, path), 'utf8')).name as string),
    ))
    expect(manifest.version).toBe(workspace.version)
    expect(`pnpm@${manifest.dependencies.pnpm}`).toBe(workspace.packageManager)
    for (const [name, version] of Object.entries(manifest.dependencies)) {
      if (typeof version === 'string' && version.startsWith('workspace:')) expect(names.has(name), name).toBe(true)
    }
  })

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
})

it('uses the host Node for lifecycle scripts before the deployed Node is installed', async () => {
  const output = await mkdtemp(join(tmpdir(), 'desktop-runtime-node-bootstrap-'))
  temporaryDirectories.push(output)
  const bins = join(output, 'node_modules/.bin')
  await mkdir(bins, { recursive: true })
  await writeFile(join(bins, 'node'), '#!/bin/sh\nexit 42\n', { mode: 0o755 })
  await writeFile(join(bins, 'node.cmd'), '@exit /b 42\r\n')
  await writeFile(join(bins, 'node.ps1'), 'exit 42\n')
  await writeFile(join(bins, 'node-which'), 'unrelated command')
  const pathKey = Object.keys(process.env).find(key => key.toLowerCase() === 'path') ?? 'PATH'
  const invokeNode = () => spawnSync(
    process.platform === 'win32' ? process.env.ComSpec ?? 'cmd.exe' : '/bin/sh',
    process.platform === 'win32' ? ['/d', '/s', '/c', 'node --version'] : ['-c', 'node --version'],
    { cwd: output, env: { ...process.env, [pathKey]: [bins, dirname(process.execPath)].join(delimiter) }, encoding: 'utf8' },
  )
  expect(invokeNode().status).toBe(42)
  await writeFile(join(bins, 'node.exe'), 'stale executable')

  await removeDesktopRuntimeNodeShims(output)

  const result = invokeNode()
  expect(result.status, result.stderr).toBe(0)
  expect(result.stdout.trim()).toBe(process.version)
  expect(await readdir(bins)).toEqual(['node-which'])
  await expect(removeDesktopRuntimeNodeShims(output)).resolves.toBeUndefined()
  await expect(removeDesktopRuntimeNodeShims(join(output, 'absent'))).resolves.toBeUndefined()
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

it('rejects broken or external workspace links while accepting contained links', async () => {
  const output = await mkdtemp(join(tmpdir(), 'desktop-runtime-relocation-'))
  temporaryDirectories.push(output)
  const runtime = join(output, 'runtime')
  await mkdir(runtime)
  await writeFile(join(runtime, 'package.json'), '{}')
  await symlink('package.json', join(runtime, 'contained'))
  await expect(assertRuntimeLinks(runtime)).resolves.toBeUndefined()
  await writeFile(join(output, 'source.json'), '{}')
  await symlink('../source.json', join(runtime, 'external'))
  await expect(assertRuntimeLinks(runtime)).rejects.toThrow('link escapes archive')
  await rm(join(runtime, 'external'))
  await symlink('../missing.json', join(runtime, 'broken'))
  await expect(assertRuntimeLinks(runtime)).rejects.toMatchObject({ code: 'ENOENT' })
})

it('keeps build approvals limited to the reviewed deployed subprocess script', async () => {
  const output = await mkdtemp(join(tmpdir(), 'desktop-runtime-build-policy-'))
  temporaryDirectories.push(output)
  const path = join(output, 'pnpm-workspace.yaml')
  await writeFile(path, 'allowBuilds:\n  unreviewed: false\n')
  await expect(approveDeployedSubprocessBuild(output)).rejects.toThrow('not approved')
  await writeFile(path, 'allowBuilds:\n  "@deepseek-ai/dsh-subprocess-local@file:packages/subprocess/subprocess-local": true\n  node: true\n  unreviewed: false\n')
  await approveDeployedSubprocessBuild(output)
  const settings = load(await readFile(path, 'utf8')) as { allowBuilds: Record<string, boolean> }
  expect(settings.allowBuilds.node).toBe(true)
  expect(settings.allowBuilds.unreviewed).toBe(false)
  expect(Object.keys(settings.allowBuilds).filter(key => key.includes('subprocess-local')))
    .toEqual([`@deepseek-ai/dsh-subprocess-local@${pathToFileURL(resolve(import.meta.dirname, '../packages/subprocess/subprocess-local')).href}`])
})

it('fails packaging when a new dependency build has not been reviewed', async () => {
  const output = await mkdtemp(join(tmpdir(), 'desktop-runtime-unapproved-build-'))
  temporaryDirectories.push(output)
  await mkdir(join(output, 'node_modules'))
  const path = join(output, 'node_modules/.modules.yaml')
  await writeFile(path, 'ignoredBuilds: [unreviewed@1.0.0]\n')
  await expect(assertDesktopRuntimeBuilds(output)).rejects.toThrow('unreviewed@1.0.0')
  await writeFile(path, 'ignoredBuilds: []\n')
  await expect(assertDesktopRuntimeBuilds(output)).resolves.toBeUndefined()
})
