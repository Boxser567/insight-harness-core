// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SessionInputShell } from '../src/client/input/facade.ts'
import { skillTokenSpans } from '../src/client/input/selected-skills.ts'
import type { DraftAttachmentId, InputTriggerController, SubmitOutcome } from '../src/client/contract/input.ts'

function fixture(sink = vi.fn(async (): Promise<SubmitOutcome> => ({ kind: 'success' })), inputTriggers?: () => InputTriggerController) {
  const shell = new SessionInputShell({ actx: new Context(), defaultSink: sink,
    ...(inputTriggers ? { inputTriggers } : {}),
    commandAttachments: { serialize: async () => [], release: () => {}, unsupportedNotice: () => 'unsupported' } })
  return { shell, sink }
}

describe('visible draft skill shortcuts', () => {
  it('toggles multiple skills in the draft and never changes another session', () => {
    const a = fixture(), b = fixture()
    a.shell.setDraft('brief')
    a.shell.toggleSkill('skill-a'); a.shell.toggleSkill('skill-b')
    expect(a.shell.snapshot.draft).toBe('brief /skill-a /skill-b ')
    a.shell.toggleSkill('skill-a')
    expect(a.shell.snapshot.draft).toBe('brief  /skill-b ')
    expect(b.shell.snapshot.draft).toBe('')
    a.shell.dispose(); b.shell.dispose()
  })
  it('clears successful sends and does not inject anything into the next message', async () => {
    const { shell, sink } = fixture()
    shell.setDraft('first'); shell.toggleSkill('skill-a'); shell.submit()
    await vi.waitFor(() => expect(shell.snapshot.draft).toBe(''))
    shell.setDraft('second'); shell.submit()
    await vi.waitFor(() => expect(sink).toHaveBeenCalledTimes(2))
    expect(sink.mock.calls.map(call => (call as unknown[])[0])).toEqual(['first /skill-a', 'second'])
    shell.dispose()
  })
  it('restores visible skill text and attachments after failure', async () => {
    const { shell } = fixture(vi.fn(async () => ({ kind: 'error' as const })))
    shell.setDraft('brief'); shell.toggleSkill('skill-a')
    shell.addAttachments(['image' as DraftAttachmentId]); shell.submit()
    await vi.waitFor(() => expect(shell.snapshot.draft).toBe('brief /skill-a '))
    expect(shell.snapshot.attachmentIds).toEqual(['image'])
    shell.dispose()
  })
  it('preserves structured file references when adding and cancelling a skill', () => {
    const { shell } = fixture()
    shell.setDraft('Read ')
    shell.insertReference({ source: 'fixture', ref: 'file', label: 'file', clipboardText: '@file' },
      { start: 5, end: 5, draftRev: shell.snapshot.draftRev })
    const occurrence = shell.snapshot.occurrences[0]
    shell.toggleSkill('skill-a')
    expect(shell.snapshot.occurrences).toEqual([occurrence])
    shell.toggleSkill('skill-a')
    expect(shell.snapshot.occurrences).toEqual([occurrence])
    expect(shell.snapshot.draft).toContain('@file')
    shell.dispose()
  })
  it('removes identical manual tokens but leaves paths and other skill names alone', () => {
    const { shell } = fixture()
    shell.setDraft('/skill-a /skill-a /skill-a/file /skill-a-more 5/8')
    shell.toggleSkill('skill-a')
    expect(shell.snapshot.draft).toBe('  /skill-a/file /skill-a-more 5/8')
    const before = shell.snapshot.draft
    shell.toggleSkill('bad/name')
    expect(shell.snapshot.draft).toBe(before)
    expect(skillTokenSpans('/usr/bin x/skill-a /skill-a', 'skill-a')).toEqual([{ start: 19, end: 27 }])
    shell.dispose()
  })
  it('cannot change a draft during command adjudication and preserves the native command', async () => {
    let resolve!: (value: undefined) => void
    const controller = { adjudicate: () => new Promise<undefined>((r) => { resolve = r }), track: vi.fn(),
      lexicon: { subscribe: () => () => {}, getSnapshot: () => new Map() } } as unknown as InputTriggerController
    const { shell, sink } = fixture(undefined, () => controller)
    shell.setDraft('/unknown prompt'); shell.submit()
    shell.toggleSkill('skill-a')
    resolve(undefined)
    await vi.waitFor(() => expect(sink).toHaveBeenCalledOnce())
    expect((sink.mock.calls[0] as unknown[])[0]).toBe('/unknown prompt')
    shell.dispose()
  })
})
