/** Check a relocated Runtime with plain Node, without workspace resolution hooks. */
import { readdir, realpath } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { isAbsolute, join, relative, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

/** Reject broken links and links escaping the deployed Runtime. */
export async function assertRuntimeLinks(directory) {
  const root = await realpath(directory)
  async function visit(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name)
      if (entry.isSymbolicLink()) {
        const target = await realpath(path)
        const suffix = relative(root, target)
        if (isAbsolute(suffix) || suffix === '..' || suffix.startsWith(`..${sep}`)) {
          throw new Error(`desktop runtime link escapes archive: ${path}`)
        }
      } else if (entry.isDirectory()) await visit(path)
    }
  }
  await visit(root)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const directory = process.argv[2]
  if (!directory) throw new Error('usage: node verify-desktop-runtime.mjs <extracted-runtime>')
  await assertRuntimeLinks(directory)
  const require = createRequire(join(directory, 'node_modules/@deepseek-ai/dsh/package.json'))
  for (const name of [
    'dsh-session-query-sqlite', 'dsh-api-session-controller', 'dsh-goal',
    'dsh-mcp-resources', 'dsh-message-feedback', 'dsh-schedule', 'dsh-cordis-host-runner',
  ]) {
    await import(pathToFileURL(require.resolve(`@deepseek-ai/${name}`)).href)
  }
  console.log('desktop runtime relocation and native host imports verified')
}
