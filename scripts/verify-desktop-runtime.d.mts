/** Check a relocated Runtime without workspace resolution hooks. */

/**
 * Reject broken links and links escaping the deployed Runtime.
 * @param directory - Extracted Runtime directory.
 * @returns Completion after all links have been checked.
 */
export function assertRuntimeLinks(directory: string): Promise<void>
