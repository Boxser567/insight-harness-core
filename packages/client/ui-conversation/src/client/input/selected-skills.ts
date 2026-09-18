/** Whole native skill tokens, excluding file paths and embedded substrings. */
const GESTURE = /(^|\s)\/([a-z0-9]+(?:-[a-z0-9]+)*)(?=\s|$)/g

/**
 * Locate exact skill gestures in the editor detect projection.
 * @param text - Editor detect text; reference nodes remain opaque placeholders.
 * @param name - Skill to toggle.
 * @returns Non-overlapping text spans in document order.
 */
export function skillTokenSpans(text: string, name: string): readonly { start: number; end: number }[] {
  return [...text.matchAll(GESTURE)].filter(match => match[2] === name).map(match => ({
    start: match.index + (match[1]?.length ?? 0),
    end: match.index + match[0].length,
  }))
}
