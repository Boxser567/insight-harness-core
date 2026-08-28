import { describe, expect, it, vi } from 'vitest'
import { SettingsDialogController } from '../src/client/settings-dialog.ts'

describe('SettingsDialogController', () => {
  it('forwards open requests only while one settings shell is attached', () => {
    const controller = new SettingsDialogController()
    const open = vi.fn()

    expect(() => { controller.open('client') }).toThrow('not mounted')
    const detach = controller.attach({ open })
    controller.open('client')
    expect(open).toHaveBeenCalledWith('client')

    detach()
    expect(() => { controller.open() }).toThrow('not mounted')
  })

  it('rejects a second live settings shell owner', () => {
    const controller = new SettingsDialogController()
    const detach = controller.attach({ open: vi.fn() })

    expect(() => { controller.attach({ open: vi.fn() }) }).toThrow('already mounted')
    detach()
  })
})
