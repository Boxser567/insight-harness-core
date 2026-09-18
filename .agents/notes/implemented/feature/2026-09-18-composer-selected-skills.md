# Agent Note: Session-scoped composer skill selection

Status: implemented

English | [中文](2026-09-18-composer-selected-skills.zh.md)

## Problem

A product skill picker must survive sends without deleting manual skill references or changing command semantics. Updating the editor draft on selection couples menu state to optimistic draft clearing.

## Decision

The input shell owns a selected-name array exposed through its existing snapshot and actions. Submit captures the array before asynchronous adjudication. Only the ordinary-message sink adds missing native skill references after reference serialization. Queue and history retain the submitted text. Host schemas and skill-loading policy remain unchanged.

## Alternatives considered

**Draft replacement:** deleting known gestures removes manual references and loses selection when the composer clears.

**New wire metadata and mandatory local loading:** enterprise services can recognize existing name gestures. A new protocol adds unnecessary storage and service changes.

## Consequences

Selection shares the input lifetime without restart persistence. History does not distinguish menu references from manually typed references. Product menus own catalogs and single-selection policy; the generic composer accepts multiple names. Service recognition requires separate acceptance testing.

This persistent-selection design is superseded by visible draft skill toggles. The current action is `toggleSkill(name)`; no hidden prefix or cross-message selection remains.
