// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SessionInputShell } from '../src/client/input/facade.ts'
import { withSelectedSkills } from '../src/client/input/selected-skills.ts'
import type { DraftAttachmentId, InputTriggerController, SubmitOutcome } from '../src/client/contract/input.ts'

function fixture(sink = vi.fn(async (): Promise<SubmitOutcome> => ({ kind: 'success' })), inputTriggers?: () => InputTriggerController) {
  const shell = new SessionInputShell({ actx: new Context(), defaultSink: sink,
    ...(inputTriggers ? { inputTriggers } : {}),
    commandAttachments: { serialize: async () => [], release: () => {}, unsupportedNotice: () => 'unsupported' } })
  return { shell, sink }
}

describe('persistent composer skills', () => {
  it('keeps selection after sends, isolates sessions, clears future additions only', async () => {
    const a = fixture(), b = fixture()
    a.shell.setSelectedSkills(['human-needs-insight'])
    for (const text of ['first', 'second']) { a.shell.setDraft(text); a.shell.submit(); await Promise.resolve() }
    expect(a.sink.mock.calls.map(call => (call as unknown[])[0])).toEqual(['/human-needs-insight first', '/human-needs-insight second'])
    expect(a.shell.snapshot.selectedSkills).toEqual(['human-needs-insight'])
    expect(b.shell.snapshot.selectedSkills).toBeUndefined()
    a.shell.setSelectedSkills([])
    a.shell.setDraft('third /manual-skill'); a.shell.submit(); await Promise.resolve()
    expect(a.sink).toHaveBeenLastCalledWith('third /manual-skill', [], 'queue', expect.any(AbortSignal))
    a.shell.dispose(); b.shell.dispose()
  })

  it('preserves manual skills and paths, deduplicating only an exact gesture', () => {
    expect(withSelectedSkills('/manual-skill body', ['menu-skill'])).toBe('/menu-skill /manual-skill body')
    expect(withSelectedSkills('body /menu-skill', ['menu-skill'])).toBe('body /menu-skill')
    expect(withSelectedSkills('/menu-skill-extra /menu-skill/file', ['menu-skill'])).toBe('/menu-skill /menu-skill-extra /menu-skill/file')
    expect(() => withSelectedSkills('body', ['bad/name'])).toThrow()
  })

  it('retains original draft and attachments on rejection without injecting into the editor', async () => {
    const { shell, sink } = fixture(vi.fn(async () => ({ kind: 'error', text: 'rejected' })))
    shell.setSelectedSkills(['menu-skill']); shell.setDraft('original')
    shell.addAttachments(['image-1' as DraftAttachmentId]); shell.submit('steer'); await Promise.resolve()
    expect(sink).toHaveBeenCalledWith('/menu-skill original', ['image-1'], 'steer', expect.any(AbortSignal))
    expect(shell.snapshot.draft).toBe('original')
    expect(shell.snapshot.attachmentIds).toEqual(['image-1'])
    expect(shell.snapshot.selectedSkills).toEqual(['menu-skill'])
    shell.submit(); await Promise.resolve()
    expect((sink.mock.calls[1] as unknown[])[0]).toBe('/menu-skill original')
    shell.dispose()
  })

  it('captures selection before asynchronous command adjudication and excludes claimed commands', async () => {
    let resolve!: (value: undefined | { claim: { token: string; submit: () => Promise<SubmitOutcome> } }) => void
    const controller = { adjudicate: vi.fn(() => new Promise((r) => { resolve = r })), track: vi.fn(),
      lexicon: { subscribe: () => () => {}, getSnapshot: () => new Map() } } as unknown as InputTriggerController
    const { shell, sink } = fixture(undefined, () => controller)
    shell.setSelectedSkills(['skill-a']); shell.setDraft('/unknown prompt'); shell.submit()
    shell.setSelectedSkills(['skill-b']); resolve(undefined)
    await vi.waitFor(() => expect(sink).toHaveBeenCalledTimes(1))
    expect((sink.mock.calls[0] as unknown[])[0]).toBe('/skill-a /unknown prompt')
    const command = vi.fn(async (): Promise<SubmitOutcome> => ({ kind: 'success' }))
    shell.setDraft('/compact'); shell.submit(); resolve({ claim: { token: '/compact', submit: command } })
    await vi.waitFor(() => expect(command).toHaveBeenCalledOnce())
    expect(sink).toHaveBeenCalledTimes(1)
    shell.dispose()
  })

  it('includes selection for attachment-only sends', async () => {
    const { shell, sink } = fixture()
    shell.setSelectedSkills(['menu-skill']); shell.addAttachments(['image-1' as DraftAttachmentId]); shell.submit(); await Promise.resolve()
    expect(sink).toHaveBeenCalledWith('/menu-skill', ['image-1'], 'queue', expect.any(AbortSignal))
    shell.dispose()
  })

  it('keeps the submitted selection while a reference serializes and the next draft changes', async () => {
    let finish!: (value: string) => void
    const controller = { track: vi.fn(),
      serializeReference: () => new Promise<string>((resolve) => { finish = resolve }),
      lexicon: { subscribe: () => () => {}, getSnapshot: () => new Map() },
    } as unknown as InputTriggerController
    const { shell, sink } = fixture(undefined, () => controller)
    shell.setSelectedSkills(['skill-a'])
    shell.setDraft('Read ')
    expect(shell.insertReference({ source: 'fixture', ref: 'file', label: 'file', clipboardText: '@file' },
      { start: 5, end: 5, draftRev: shell.snapshot.draftRev })).toBe(true)
    shell.submit('queue')
    shell.setSelectedSkills(['skill-b'])
    shell.setDraft('next draft')
    finish('file content')
    await vi.waitFor(() => expect(sink).toHaveBeenCalledOnce())
    expect((sink.mock.calls[0] as unknown[])[0]).toBe('/skill-a Read file content')
    expect(shell.snapshot.draft).toBe('next draft')
    expect(shell.snapshot.selectedSkills).toEqual(['skill-b'])
    shell.dispose()
  })
})
