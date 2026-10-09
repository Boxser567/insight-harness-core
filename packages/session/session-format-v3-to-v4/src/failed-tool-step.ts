/** Settle missing V3 tool results only for the recorded scheduler-unavailable failure. */

import { isSessionFormatJsonObject } from '@deepseek-ai/dsh-session-format'
import type { SessionFormatEvent } from '@deepseek-ai/dsh-session-format'

/** Pending advertisements in one source step; results refer to target call coordinates. */
export class V3FailedToolStep {
  private readonly calls = new Map<string, number | undefined>()

  /** Whether a step boundary requires failure evidence before it can be emitted. */
  get unresolved(): boolean { return this.calls.size > 0 }

  /**
   * Track transformed advertisements and append results without relaxing validation.
   * @param event - emitted target event; the final restorer still validates all relationships.
   */
  observe(event: SessionFormatEvent): void {
    const data = event.data
    if (!isSessionFormatJsonObject(data)) return
    if (event.type === 'step/start' || event.type === 'step/end') this.calls.clear()
    if (event.type === 'assistant/message' && isSessionFormatJsonObject(data['message'])) {
      const content = data['message']['content']
      if (!Array.isArray(content)) return
      for (const block of content) {
        if (isSessionFormatJsonObject(block) && block['type'] === 'tool-call' && typeof block['id'] === 'string') {
          this.calls.set(block['id'], undefined)
        }
      }
    } else if (event.type === 'tool/call' && typeof data['callId'] === 'string' && this.calls.has(data['callId'])) {
      this.calls.set(data['callId'], event.seq)
    } else if (event.type === 'tool/result' && event['surfaceOp'] === 'append' && isSessionFormatJsonObject(data['message'])) {
      const id = data['message']['toolCallId']
      if (typeof id === 'string') this.calls.delete(id)
    }
  }

  /**
   * Create error results before a closed step whose immediately following turn records the known failure.
   * @param boundary - original step/end held for one source event.
   * @param following - immediately following source event; other errors never authorize repair.
   * @param nextSeq - first target position available for the inserted results.
   * @returns error results, or no events when failure evidence is absent or inconsistent.
   */
  repair(boundary: SessionFormatEvent, following: SessionFormatEvent, nextSeq: number): readonly SessionFormatEvent[] {
    const step = boundary.data
    const end = following.data
    if (following.type !== 'turn/end' || !isSessionFormatJsonObject(step) || !isSessionFormatJsonObject(end)) return []
    const turn = step['turn']
    const stepNumber = step['step']
    if (turn !== end['turn'] || typeof turn !== 'number' || typeof stepNumber !== 'number') return []
    const reason = end['reason']
    if (!isSessionFormatJsonObject(reason) || reason['kind'] !== 'error') return []
    const error = reason['error']
    if (!isSessionFormatJsonObject(error) || error['code'] !== 'UNKNOWN'
      || error['message'] !== "Cannot read properties of undefined (reading 'prepare')"
      || ![...this.calls.values()].some(seq => seq !== undefined)) return []
    return [...this.calls].map(([callId, callSeq], offset) => {
      const seq = nextSeq + offset
      const notStarted = callSeq === undefined
      return {
        type: 'tool/result', seq, time: boundary.time, surfaceOp: 'append',
        ...(callSeq === undefined ? {} : { sourceEventSeqs: [callSeq] }),
        data: {
          turn, step: stepNumber,
          error: notStarted
            ? { name: 'ToolNotStartedError', code: 'TOOL_NOT_STARTED' }
            : { name: 'HistoricalToolResultMissingError', code: 'HISTORICAL_TOOL_RESULT_MISSING' },
          message: {
            id: notStarted ? `interrupted-tool-result-${callId}-${seq}` : `historical-failed-tool-result-${callId}-${seq}`,
            role: 'tool', source: { kind: 'tool', callId }, toolCallId: callId, isError: true,
            content: [{ type: 'text', text: notStarted
              ? 'The tool call was interrupted before the Harness recorded it as started. Retry it if it is still needed.'
              : 'The historical step failed in the tool scheduler without recording this tool result. Its execution outcome is unknown; check for side effects before retrying.' }],
          },
        },
      }
    })
  }
}
