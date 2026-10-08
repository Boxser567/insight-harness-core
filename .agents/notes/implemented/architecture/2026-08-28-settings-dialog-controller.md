# Agent Note: Settings dialog controller

Status: implemented

English | [中文](2026-08-28-settings-dialog-controller.zh.md)

## Problem

Client plugins can contribute settings sections, but only the settings trigger owned by `ui-settings-general` can open the shared settings shell. A product integration that needs a Settings action otherwise has to locate private DOM, simulate a click, or render a second settings dialog, coupling it to presentation details that the slot APIs do not promise.

## Decision

`ui-settings-general` provides `ctx.settingsDialog` with `open(sectionId?)`. The service opens the existing settings shell and requests one registered section; a missing or unknown id uses the first current section. It controls presentation only and does not register, read, or mutate settings.

`SettingsDialogController` owns no React state. The settings slot registration connects the controller to the shared owner store and disconnects it on unregister. Calls outside that interval fail rather than queueing a request for a later or replacement mount, and a second concurrent shell owner is rejected.

The Cordis service and the slot registration share the providing plugin's lifecycle. Plugin teardown removes the service; a later activation creates a fresh controller and shell connection.

The shell combines the product-owned `settings.launcher` with the Connection-owned recovery state. The shared modal owns focus restoration. A null launcher suppresses its empty row without unregistering the dialog service.

## Alternatives considered

**Locate the settings trigger in the DOM and click it.** Rejected because DOM structure, classes, and event ownership are private presentation details rather than client extension APIs.

**Move dialog state into the `ui-settings` base package.** Rejected because that package owns the settings domain and slot declarations without depending on presentation packages; the modal and its local viewing state already belong to `ui-settings-general`.

**Let each product plugin render its own settings dialog.** Rejected because duplicate shells split navigation, accessibility behavior, and settings presentation ownership.

## Consequences

Client plugins have one product-independent action for opening Settings while the existing trigger, Escape handling, focus behavior, section ledger, and settings data ownership remain unchanged. The API deliberately has no close, toggle, or settings mutation methods; additional actions require a demonstrated cross-plugin use case rather than exposing component state wholesale.

The explicit failure before slot registration exposes load-order or missing-shell defects immediately. Callers invoked by rendered UI naturally run after registration; code that can run earlier must wait for its own usable UI state instead of relying on deferred global actions.
