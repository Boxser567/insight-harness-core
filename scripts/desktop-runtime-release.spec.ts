import { describe, expect, it } from 'vitest'
import { desktopRuntimeArchiveName, desktopRuntimeChecksumLine } from './desktop-runtime-release.ts'

describe('desktop runtime release assets', () => {
  it('names each target archive and writes its checksum sidecar', () => {
    const name = desktopRuntimeArchiveName('0.1.1-rc.2', 'win32-x64')
    expect(name).toBe('insight-harness-runtime-0.1.1-rc.2-win32-x64.tar.gz')
    expect(desktopRuntimeChecksumLine(name, 'a'.repeat(64))).toBe(`${'a'.repeat(64)}  ${name}\n`)
  })

  it('rejects unsupported artifact facts', () => {
    expect(() => desktopRuntimeArchiveName('release', 'linux-arm64')).toThrow('desktop runtime target')
    expect(() => desktopRuntimeChecksumLine('runtime.tar.gz', 'invalid')).toThrow('SHA-256')
  })
})
