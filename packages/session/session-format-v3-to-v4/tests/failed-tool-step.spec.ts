import { describe, expect, it } from 'vitest'
import { Session, SessionId, SessionLogOffset, type SessionEvent, type SessionHeader } from '@deepseek-ai/dsh-session'
import { createSessionFormatCatalogWithChildren, sessionFormatCatalog } from '@deepseek-ai/dsh-session-format-catalog'
import { SessionFormatEventCollector, type SessionFormatEvent, type SessionFormatJsonObject } from '@deepseek-ai/dsh-session-format'
import { createSessionFormatV3ToV4 } from '../src/index.ts'
import { V3FailedToolStep } from '../src/failed-tool-step.ts'

const header = { type: 'session', version: 3, id: 'failed-tools', createdAt: 1, isSeeded: false, delegationDepth: 0 }
const failure = { kind: 'error', error: { code: 'UNKNOWN', message: "Cannot read properties of undefined (reading 'prepare')" } }
const step = { turn: 1, step: 1 }

function source(reason: SessionFormatJsonObject = failure): SessionFormatEvent[] {
  const rows = [
    { type: 'turn/start', data: { turn: 1 } },
    { type: 'step/start', data: step },
    { type: 'user/message', surfaceOp: 'append', data: { id: 'question', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'Keep this historical question.' }] } },
    { type: 'assistant/message', surfaceOp: 'append', data: { ...step, stream: [], message: {
      id: 'assistant', role: 'assistant', source: { kind: 'model', provider: 'mock', model: 'mock' },
      content: ['started', 'advertised'].map(id => ({ type: 'tool-call', id, name: 'read', arguments: '{}' })),
    } } },
    { type: 'tool/call', data: { ...step, callId: 'started', name: 'read', arguments: '{}' } },
    { type: 'step/end', data: step },
    { type: 'turn/end', data: { turn: 1, reason } },
  ]
  return rows.map((row, seq) => ({ ...row, seq, time: seq + 2 })) as SessionFormatEvent[]
}

function restore(events: readonly SessionFormatEvent[], version = 3) {
  const reader = createSessionFormatCatalogWithChildren([]).createRestore({ ...header, version }, { recovery: 'strict', validation: 'current' })
  for (const event of events) reader.decodeRow(event)
  return reader.finish()
}

describe('recorded V3 scheduler failure', () => {
  it('retains source history and settles missing results before the failed step boundary', () => {
    const events = source()
    const original = JSON.stringify(events)
    const artifact = restore(events)
    const results = artifact.events.filter(event => event.type === 'tool/result')
    expect(results).toHaveLength(2)
    expect(results.map(event => (event.data as SessionFormatJsonObject)['error'])).toEqual([
      expect.objectContaining({ code: 'HISTORICAL_TOOL_RESULT_MISSING' }),
      expect.objectContaining({ code: 'TOOL_NOT_STARTED' }),
    ])
    expect(artifact.events.map(event => event.seq)).toEqual(artifact.events.map((_, seq) => seq))
    expect(artifact.events.find(event => event.type === 'step/end')?.seq).toBe(7)
    expect(JSON.stringify(events)).toBe(original)
    const reopened = sessionFormatCatalog.createRestore(sessionFormatCatalog.encodeCurrentHeader(artifact.header, 0), { recovery: 'strict', validation: 'current' })
    for (const event of artifact.events) reopened.decodeRow(sessionFormatCatalog.encodeCurrentEvent(event))
    expect(reopened.finish()).toEqual(artifact)
    const session = Session.fromRestore(SessionId(artifact.header.id), artifact.events as SessionEvent[], { ...artifact.header, id: SessionId(artifact.header.id), version: 4 } as SessionHeader, SessionLogOffset(0), 'detached')
    expect(session.deriveMessages().filter(message => message.role === 'tool')).toHaveLength(2)
    expect(session.deriveMessages().filter(message => message.role === 'tool').map(message => message.content)).toMatchInlineSnapshot(`
      [
        [
          {
            "text": "The historical step failed in the tool scheduler without recording this tool result. Its execution outcome is unknown; check for side effects before retrying.",
            "type": "text",
          },
        ],
        [
          {
            "text": "The tool call was interrupted before the Harness recorded it as started. Retry it if it is still needed.",
            "type": "text",
          },
        ],
      ]
    `)
  })

  it.each([
    { kind: 'completed' },
    { kind: 'interrupted' },
    { kind: 'error', error: { code: 'UNKNOWN', message: 'Another failure' } },
  ])('refuses unresolved tools without the exact recorded failure: %j', (reason) => {
    expect(() => restore(source(reason))).toThrow('unresolved tool call')
  })

  it('does not repair native V4 or a closed step at EOF without evidence', () => {
    expect(() => restore(source(), 4)).toThrow('unresolved tool call')
    expect(() => restore(source().slice(0, -1))).toThrow('unresolved tool call')
  })

  it('preserves existing tool results and remaps references after inserted results', () => {
    const rows = source()
    const later: SessionFormatEvent = { ...rows[2]!, seq: 7, time: 20, data: { id: 'next-question', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'Next question' }] } }
    const title: SessionFormatEvent = { type: 'session/title', seq: 8, time: 21, data: { title: 'Next question', source: { kind: 'generated' }, messageSeqs: [7] } }
    const restored = restore([...rows, later, title])
    expect(restored.events.at(-1)).toMatchObject({ seq: 10, data: { messageSeqs: [9] } })
    const completed: SessionFormatEvent = { type: 'tool/result', seq: 5, time: 7, surfaceOp: 'append', data: { ...step, message: {
      id: 'actual-result', role: 'user', source: { kind: 'tool', callId: 'started' },
      content: [{ type: 'tool-result', toolCallId: 'started', content: [{ type: 'text', text: 'Recorded success' }] }],
    } } }
    // The only registered call is already settled: this error does not prove missing scheduler results.
    const settled = [...rows.slice(0, 5), completed, ...rows.slice(5).map(event => ({ ...event, seq: event.seq + 1 }))]
    expect(() => restore(settled)).toThrow('unresolved tool call')
  })

  it('does not settle a step from another turn or tolerate gaps while awaiting failure evidence', () => {
    const rows = source()
    const otherTurn = rows.map(event => event.type === 'turn/end' ? { ...event, data: { turn: 2, reason: failure } } : event)
    expect(() => restore(otherTurn)).toThrow()
    const stage = createSessionFormatV3ToV4([]).createStage({ sourceHeader: header, targetHeader: { ...header, version: 4 }, sourceInheritedEventCount: undefined, sourceKind: 'decoded' })
    const output = new SessionFormatEventCollector()
    rows.slice(0, -1).forEach(row => stage.transformEvent(row, output))
    expect(() => stage.transformEvent({ ...rows.at(-1)!, seq: 99 }, output)).toThrow('dense')
    const fresh = createSessionFormatV3ToV4([]).createStage({ sourceHeader: header, targetHeader: { ...header, version: 4 }, sourceInheritedEventCount: undefined, sourceKind: 'decoded' })
    expect(() => fresh.transformEvent({ ...rows[0]!, seq: 1 }, output)).toThrow('dense')
  })

  it('ignores malformed advertisements/results and requires a turn ending immediately after the boundary', () => {
    const pending = new V3FailedToolStep()
    const rows = source()
    rows.slice(0, 5).forEach(row => pending.observe(row))
    pending.observe({ type: 'feedback/record', seq: 5, time: 7, data: null })
    pending.observe({ type: 'assistant/message', seq: 5, time: 7, data: { message: { content: 'invalid' } } })
    pending.observe({ type: 'tool/result', seq: 5, time: 7, surfaceOp: 'append', data: { message: { toolCallId: 9 } } })
    expect(pending.unresolved).toBe(true)
    expect(pending.repair(rows[5]!, { ...rows[6]!, type: 'feedback/record' }, 5)).toEqual([])
    expect(pending.repair(rows[5]!, { ...rows[6]!, data: null }, 5)).toEqual([])
    expect(pending.repair(rows[5]!, rows[6]!, 5)).toHaveLength(2)
  })
})
