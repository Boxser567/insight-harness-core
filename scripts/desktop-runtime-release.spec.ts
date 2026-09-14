import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { load } from 'js-yaml'
import { desktopRuntimeArchiveName, desktopRuntimeChecksumLine } from './desktop-runtime-release.ts'

describe('desktop runtime release assets', () => {
  it('collects all native artifacts while requiring opt-in publication and a tag check', () => {
    const workflow = load(readFileSync(new URL('../.github/workflows/runtime-release.yml', import.meta.url), 'utf8')) as {
      jobs: { package: {
        strategy: { matrix: { include: { target: string }[] } }
        steps: { name?: string; uses?: string; if?: string; with?: { path?: string } }[]
      } }
    }
    const job = workflow.jobs.package
    expect(job.strategy.matrix.include.map(entry => entry.target)).toEqual(['darwin-arm64', 'darwin-x64', 'win32-x64'])
    expect(job.steps.find(step => step.name === 'Collect validation artifacts')?.with?.path).toBe('dist/runtime-release/*.tar.gz*')
    expect(job.steps.find(step => step.name === 'Require an existing tag for publication')?.if).toBe('inputs.publish')
    expect(job.steps.filter(step => step.uses?.includes('action-gh-release')).map(step => step.if)).toEqual(['inputs.publish'])
  })
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
