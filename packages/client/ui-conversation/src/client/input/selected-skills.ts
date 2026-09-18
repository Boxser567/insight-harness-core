/** Native explicit skill references for a captured ordinary-message submission. */
const GESTURE = /(^|\s)\/([a-z0-9]+(?:-[a-z0-9]+)*)(?=\s|$)/g

/**
 * Validate and detach explicit skill names.
 * @param names - Explicit skill names.
 * @returns A detached, unique selection.
 */
export function validateSelectedSkills(names: readonly string[]): readonly string[] {
  if (names.some(name => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name))) {
    throw new Error('Invalid selected skill name')
  }
  return [...new Set(names)]
}

/**
 * Add only selected references absent from the original text. Call after command
 * adjudication and reference serialization; never write the result back into the editor.
 * @param text - Serialized user text, preserved verbatim.
 * @param names - Selection captured when this message was submitted.
 * @returns User text with native explicit skill references, ready for the ordinary sink.
 */
export function withSelectedSkills(text: string, names: readonly string[]): string {
  const existing = new Set([...text.matchAll(GESTURE)].map(match => match[2]))
  const missing = validateSelectedSkills(names).filter(name => !existing.has(name))
  return missing.length === 0 ? text : `${missing.map(name => `/${name}`).join(' ')}${text ? ` ${text}` : ''}`
}
