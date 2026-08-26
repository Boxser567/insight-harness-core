import { unwatchFile, watchFile } from 'node:fs'
import { stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Service } from '@deepseek-ai/cordis'

export const name = 'dsh-desktop-hmr-fallback'
export const inject = ['loader']

export class ConfigWatchHmr extends Service {
  constructor(ctx) {
    super(ctx, 'hmr')
  }

  async registerConfig(filename, refresh) {
    const target = resolve(filename)
    let signature = await stamp(target)
    let pending
    let queue = Promise.resolve()
    const check = () => {
      queue = queue.then(async () => {
        const next = await stamp(target)
        if (next === signature) return
        signature = next
        await refresh()
      }).catch(error => this.ctx.logger?.warn?.(error))
    }
    watchFile(target, { interval: 100, persistent: false }, (current, previous) => {
      if (current.mtimeMs === previous.mtimeMs && current.size === previous.size) return
      clearTimeout(pending)
      pending = setTimeout(check, 100)
      pending.unref?.()
    })
    return async () => {
      clearTimeout(pending)
      unwatchFile(target)
      await queue.catch(() => undefined)
    }
  }
}

async function stamp(path) {
  try {
    const info = await stat(path)
    return `${info.mtimeMs}:${info.size}`
  } catch {
    return ''
  }
}

export function apply(ctx) {
  if (ctx.loader.internal !== undefined) return
  ctx.plugin(ConfigWatchHmr)
}
