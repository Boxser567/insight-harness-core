# Agent Note: Evidenced historical scheduler failures

Status: implemented

English | [中文](2026-10-09-historical-scheduler-failure.zh.md)

## Problem

Released V3 readers admitted histories whose tool scheduler failed after recording a call but before recording results. V4 requires every advertised call to have a result before a closed step. Rejecting these histories preserves storage but prevents users from reading otherwise intact messages.

## Decision

The V3-to-V4 migration repairs only the recorded `UNKNOWN` failure `Cannot read properties of undefined (reading 'prepare')` immediately after the same turn's closed step, with at least one unresolved recorded call. Started calls receive an error describing an unknown execution outcome; advertisements without a recorded start receive the existing not-started error. Neither result claims success. The migration retains original messages, remaps subsequent local references, and preserves source generations. Native V4 admission remains unchanged.

## Alternatives considered

**Disable relationship validation.** Unresolved calls could enter later model requests and fail provider validation; malformed histories would become writable.

**Invent successful results or rerun tools.** The missing record cannot establish execution outcome or side effects. Automatic execution could repeat destructive operations.

**Reject every affected history.** This preserves data but makes ordinary saved messages inaccessible despite explicit evidence explaining the missing results. Read-only exports remain appropriate for failures without this evidence.

## Consequences

Affected histories become readable and continuable, with explicit errors in subsequent model context. Users must inspect side effects before retrying an unknown execution outcome. Other inconsistent histories still fail closed. Existing source files remain intact; only successful write opens publish validated V4 successors. Focused persistence coverage verifies compressed and uncompressed sources, read-only opens, successor publication, and continuation.
