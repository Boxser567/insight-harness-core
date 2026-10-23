import { link, lstat, mkdtemp, mkdir, readFile, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'
import { load as loadYaml } from 'js-yaml'
import {
  addDesktopHmrFallback,
  assertDesktopRuntimeLayout,
  assertDesktopRuntimeLinks,
  assertDesktopRuntimePeers,
  createDesktopRuntimeMetadata,
  materializeVendoredPackages,
  materializeDeployedProjectPackages,
  parseDesktopRuntimeTarget,
  pnpmInvocation,
} from './desktop-runtime-artifact.ts'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

describe('desktop runtime artifact metadata', () => {
  it('records complete lockfile entries for every Runtime registry dependency', async () => {
    const lock = loadYaml(await readFile(new URL('../pnpm-lock.yaml', import.meta.url), 'utf8')) as {
      importers: Record<string, { dependencies: Record<string, { version: string }> }>
      packages: Record<string, object>
      snapshots: Record<string, object>
    }
    for (const [name, dependency] of Object.entries(lock.importers['runtime/desktop']!.dependencies)) {
      if (dependency.version.startsWith('link:')) continue
      const key = `${name}@${dependency.version}`
      expect(lock.packages[key], `${key} resolution`).toBeDefined()
      expect(lock.snapshots[key], `${key} dependency snapshot`).toBeDefined()
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

  it.each([
    ['schemastery', '@deepseek-ai/schemastery', 'Schema'],
    ['hmr', '@deepseek-ai/cordis-plugin-hmr', 'Hmr'],
  ])('copies %s without following cyclic workspace dependencies', async (directory, name, sourceText) => {
    const output = await mkdtemp(join(tmpdir(), 'desktop-runtime-artifact-'))
    temporaryDirectories.push(output)
    const destination = join(output, 'node_modules', name)
    await mkdir(join(destination, '..'), { recursive: true })
    await symlink(`/missing/vendor/${directory}`, destination)
    const dependency = join(output, 'node_modules', '@deepseek-ai', 'cosmokit')
    await mkdir(dependency, { recursive: true })
    await writeFile(join(dependency, 'package.json'), '{"name":"@deepseek-ai/cosmokit"}\n')

    await materializeVendoredPackages(output)

    expect(JSON.parse(await readFile(join(destination, 'package.json'), 'utf8'))).toMatchObject({
      name,
    })
    expect((await lstat(destination)).isSymbolicLink()).toBe(false)
    expect(await readFile(join(destination, 'src', 'index.ts'), 'utf8')).toContain(sourceText)
    await expect(lstat(join(destination, 'node_modules'))).rejects.toMatchObject({ code: 'ENOENT' })
    expect(createRequire(join(destination, 'package.json')).resolve('@deepseek-ai/cosmokit/package.json'))
      .toBe(await realpath(join(dependency, 'package.json')))
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


it.each([false, true])('materializes recorded importer packages with a pre-created peer directory=%s', async (peerDirectory) => {
  const workspace = await mkdtemp(join(tmpdir(), 'desktop-runtime-placement-'))
  temporaryDirectories.push(workspace)
  const output = join(workspace, 'out')
  const misplaced = join(workspace, 'runtime/desktop/node_modules/@deepseek-ai/dsh')
  await mkdir(misplaced, { recursive: true })
  await writeFile(join(misplaced, 'package.json'), '{"name":"@deepseek-ai/dsh"}')
  await mkdir(join(misplaced, 'node_modules'), { recursive: true })
  await symlink('/missing/workspace/dependency', join(misplaced, 'node_modules', 'broken-source-link'))
  await mkdir(join(output, 'node_modules'), { recursive: true })
  if (peerDirectory) await mkdir(join(output, 'node_modules/@deepseek-ai/dsh/node_modules'), { recursive: true })
  await writeFile(join(output, 'node_modules/.modules.yaml'), JSON.stringify({ hoistedLocations: {
    dsh: ['runtime/desktop/node_modules/@deepseek-ai/dsh'],
    outside: ['../unrelated'],
  } }))
  await materializeDeployedProjectPackages(output, workspace)
  expect(await readFile(join(output, 'node_modules/@deepseek-ai/dsh/package.json'), 'utf8')).toBe('{"name":"@deepseek-ai/dsh"}')
  await expect(lstat(join(output, 'node_modules/@deepseek-ai/dsh/node_modules/broken-source-link'))).rejects.toMatchObject({ code: 'ENOENT' })
  await writeFile(join(output, 'node_modules/@deepseek-ai/dsh/package.json'), 'existing')
  await materializeDeployedProjectPackages(output, workspace)
  expect(await readFile(join(output, 'node_modules/@deepseek-ai/dsh/package.json'), 'utf8')).toBe('existing')
})

it('exposes deployed workspace packages after relocation without linking to source', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'desktop-runtime-alias-'))
  temporaryDirectories.push(workspace)
  const output = join(workspace, 'out')
  const placement = 'out/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-llm-pi-ai'
  await mkdir(join(workspace, placement), { recursive: true })
  await writeFile(join(workspace, placement, 'package.json'), '{"name":"@deepseek-ai/dsh-llm-pi-ai"}')
  await writeFile(join(output, 'node_modules/.modules.yaml'), JSON.stringify({ hoistedLocations: {
    '@deepseek-ai/dsh-llm-pi-ai@file:packages/llm/llm-pi-ai(peer@1.0.0)': [placement],
    '@deepseek-ai/source-only@file:packages/source-only': ['packages/source-only'],
    'registry-package@1.0.0': [placement],
  } }))
  await materializeDeployedProjectPackages(output, workspace)
  const moved = join(workspace, 'relocated')
  await rename(output, moved)
  const manifest = join(moved, 'node_modules/@deepseek-ai/dsh-llm-pi-ai/package.json')
  expect(JSON.parse(await readFile(manifest, 'utf8'))).toEqual({ name: '@deepseek-ai/dsh-llm-pi-ai' })
  await expect(lstat(join(moved, 'node_modules/@deepseek-ai/source-only'))).rejects.toMatchObject({ code: 'ENOENT' })
  await expect(lstat(join(moved, 'node_modules/registry-package'))).rejects.toMatchObject({ code: 'ENOENT' })
  await expect(assertDesktopRuntimeLinks(moved)).resolves.toBeUndefined()
})

it('rejects missing, external and absolute links before packaging', async () => {
  const output = await mkdtemp(join(tmpdir(), 'desktop-runtime-links-'))
  temporaryDirectories.push(output)
  const runtime = join(output, 'runtime')
  await mkdir(runtime)
  const alias = join(runtime, 'alias')
  await symlink('missing', alias)
  await expect(assertDesktopRuntimeLinks(runtime)).rejects.toThrow('ENOENT')
  await rm(alias)
  await symlink('..', alias, 'dir')
  await expect(assertDesktopRuntimeLinks(runtime)).rejects.toThrow('link escapes')
  await rm(alias)
  await symlink(runtime, alias, 'dir')
  await expect(assertDesktopRuntimeLinks(runtime)).rejects.toThrow('absolute link')
})
