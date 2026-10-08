/** Public control of the settings shell owned by this package. */
export interface ISettingsDialog {
  /**
   * Open the mounted settings shell and optionally select one registered section.
   * @param sectionId - Registered settings section id; missing or unknown ids use the first section.
   * @throws When the settings shell is not mounted.
   */
  open(sectionId?: string): void
}

/** Store actions connected for the lifetime of one registered settings shell. */
export interface SettingsDialogActions {
  /**
   * Open the settings shell.
   * @param sectionId - Requested settings section id.
   */
  open(sectionId?: string): void
}

/** Routes cross-plugin settings requests to the mounted settings shell. */
export class SettingsDialogController implements ISettingsDialog {
  #actions: SettingsDialogActions | undefined

  /**
   * Attach the sole mounted settings shell.
   * @param actions - Settings owner store actions.
   * @returns An idempotent disposer that disconnects these actions.
   * @throws When another settings shell remains attached.
   */
  attach(actions: SettingsDialogActions): () => void {
    if (this.#actions !== undefined) throw new Error('settings dialog: shell already mounted')
    this.#actions = actions
    return () => {
      if (this.#actions === actions) this.#actions = undefined
    }
  }

  /**
   * Open the mounted settings shell and optionally select one registered section.
   * @param sectionId - Registered settings section id; missing or unknown ids use the first section.
   * @throws When the settings shell is not mounted.
   */
  open(sectionId?: string): void {
    if (this.#actions === undefined) throw new Error('settings dialog: shell not mounted')
    this.#actions.open(sectionId)
  }
}
