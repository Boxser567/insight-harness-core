import { describe, expect, it } from 'vitest'
import {
  createDesktopRuntimeMetadata,
  parseDesktopRuntimeTarget,
  pnpmInvocation,
} from './desktop-runtime-artifact.ts'

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
})
