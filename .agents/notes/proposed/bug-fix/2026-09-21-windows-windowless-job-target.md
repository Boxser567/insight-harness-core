# Agent Note: Windowless ordinary Windows Job targets

Status: proposed

English | [中文](2026-09-21-windows-windowless-job-target.zh.md)

## Problem

SW_HIDE leaves a console window object that can still produce taskbar activity during repeated desktop PowerShell invocations. Checking only IsWindowVisible cannot distinguish this from windowless execution.

## Proposal

Apply CREATE_NO_WINDOW only to the ordinary CreateProcessW Job target. The ordinary sandbox runner then owns the console context inherited by restricted children. Keep CreateProcessAsUserW flags unchanged because restricted console allocation previously failed DLL initialization. Keep suspended creation, Job assignment, carrier descriptors and cancellation unchanged.

## Alternatives considered

**Restricted-target flags:** rejected because the existing ACL sandbox documents STATUS_DLL_INIT_FAILED with CREATE_NO_WINDOW and CREATE_NEW_CONSOLE.

**Persistent console broker:** reserve for a failing native inheritance test; it adds process ownership and shutdown machinery absent from this small candidate.

## Acceptance criteria

Native tests must observe no console window in ordinary descendants and both restricted modes, successful repeated PowerShell runs, and unchanged cancellation, output and write restrictions. Windows 10/11 interactive desktop acceptance must separately confirm no taskbar churn. No runtime release pointer changes before those checks pass.

## Risks

The candidate depends on restricted children inheriting a usable windowless console context. macOS unit tests cannot establish that Windows behavior; a native failure blocks promotion rather than weakening the assertion.
