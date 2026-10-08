# Agent Note: Null settings trigger preserves the dialog host

Status: implemented

English | [中文](2026-08-28-null-settings-trigger-preserves-dialog-host.zh.md)

## Problem

The settings shell occupies the single `sidebar.settings` slot and owns both the visible trigger row and the mounted `SettingsDialogController` attachment. A deployment that replaces the entire slot to remove the redundant row also unmounts the controller attachment, so another plugin's `ctx.settingsDialog.open()` call fails instead of opening the shared settings panel.

## Decision

`SettingsRoot` remains the `sidebar.settings` registrant and delegates the complete trigger row to `settings.launcher`, including the `openSettings` callback. Its fallback renders the standard button using `TriggerContent`. A registrant that returns null suppresses the row without unmounting `SettingsRoot`, its dialog panel, onboarding coordination, or `SettingsDialogController` attachment. Deployments customize visibility through the public `settings.launcher` slot and leave the settings shell registered.

## Alternatives considered

**Replace `sidebar.settings` with a null component.** Rejected because the single slot owns the dialog host as well as the trigger row; replacing it removes the service attachment that alternate entry points require.

**Hide the trigger with CSS or DOM mutation.** Rejected because it depends on private markup and bypasses the slot lifecycle, making a layout-only preference depend on implementation details.

**Split the dialog host into a separate root plugin.** Rejected because assigning complete row ownership to `settings.launcher` provides the required separation without adding another lifecycle owner or changing existing registration topology.

## Consequences

Returning null from the active `settings.launcher` contribution has a defined presentation effect while the default registrant preserves the existing trigger behavior. Alternate settings entry points can hide the sidebar row and continue opening any registered section through `ctx.settingsDialog`. The settings-root and assembled shell client tests pin the absent row, the mounted dialog service, and the default button behavior.
