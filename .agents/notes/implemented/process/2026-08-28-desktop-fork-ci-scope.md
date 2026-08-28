# Agent Note: Desktop fork CI scope

Status: implemented

English | [中文](2026-08-28-desktop-fork-ci-scope.zh.md)

## Problem

The Insight desktop fork ships macOS and Windows products, while the inherited Core workflows automatically spend hosted capacity on Linux sandbox matrices and npm package rehearsals after every `master` push. The macOS Sandbox workflow also runs the entire unit suite before its Seatbelt proof, so unrelated PowerShell timing failures can prevent the platform sandbox check from starting. A Runtime artifact test reads ignored vendor build output and therefore passes only in a previously built checkout.

## Decision

`sandbox.yml` keeps an automatic macOS job limited to the clean-checkout desktop Runtime artifact test and the two real Seatbelt E2E files. Its bwrap and Landlock jobs remain available through `workflow_dispatch` only. The existing Windows master workflow continues to own native PowerShell coverage, and `runtime-release.yml` remains the release path for `darwin-arm64`, `darwin-x64`, and `win32-x64` artifacts.

`release.yml`, `release-vendor.yml`, and `landlock-run.yml` become manual workflows in this fork. Their jobs remain intact so an upstream synchronization, dependency release rehearsal, or explicit Linux investigation can run the inherited coverage without restoring it to every product push.

The Runtime materialization unit test verifies tracked vendor source files rather than ignored `vendor/*/lib` output. The production assembler still builds official artifacts before deployment, and its built-artifact checks continue to verify the release path.

## Alternatives considered

**Disable every inherited Core workflow.** This minimizes Actions use but removes macOS sandbox and Windows compatibility signals that protect the supported desktop platforms.

**Keep the complete Sandbox matrix automatic.** This preserves upstream coverage on every push but spends product iteration time on Linux-only mechanisms and lets unrelated full-suite failures obscure the macOS sandbox result.

**Delete Linux and npm workflows.** Deletion makes later upstream synchronization harder and removes useful manual diagnostics. Retaining their jobs behind explicit dispatch preserves those capabilities without automatic cost.

## Testing

A clean-checkout regression test proves that `desktop-runtime-artifact.spec.ts` does not require ignored vendor build output. Workflow structure tests pin the automatic macOS commands, manual-only Linux and npm triggers, and the Runtime release target inventory. The two Seatbelt E2E files run under a real host `sandbox-exec` and reject a self-skipped platform proof.

## Consequences

Product pushes spend hosted capacity on the supported macOS sandbox path and the existing Windows path instead of Linux and npm release rehearsals. Linux and npm regressions can remain undiscovered until a maintainer runs the manual workflows or prepares an upstream synchronization. The automatic macOS job does not supply whole-repository Darwin parity; it proves the supported desktop artifact and Seatbelt paths, while broader macOS checks are an explicit maintenance action.
