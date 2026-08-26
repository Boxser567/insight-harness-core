# Agent Note: Desktop Runtime release artifacts

Status: implemented

English | [中文](2026-08-25-desktop-runtime-release-artifacts.zh.md)

## Problem

The desktop Shell must run a Core version selected by the product owner, rather than whichever `@deepseek-ai/dsh` version happens to resolve from an npm registry during Shell packaging. A repository checkout works through workspace hoisting, but that hidden resolution does not prove that a deployed Runtime contains every required executable and peer dependency.

## Decision

`runtime/desktop` is a private pnpm deploy root outside `apps/`, so the normal DSH npm release family cannot publish it. It declares the Runtime's Node and pnpm executables, the DSH CLI, and the vendored Cordis packages required after deployment. `desktop-runtime-artifact.ts` builds the Core checkout, deploys that root for one native target, materializes every deployed vendor-package link, adds the desktop HMR fallback to the deployed DSH dependency graph, verifies the Node, pnpm, and DSH entries, and writes `runtime.json` with the Core repository, version, immutable Git commit, and target.

`desktop-runtime-release.ts` archives that directory as `insight-harness-runtime-<version>-<target>.tar.gz`, writes a SHA-256 sidecar, and copies the Runtime metadata as a release asset. The manual `Release desktop Runtime` workflow builds all supported targets from the requested existing tag and attaches the three files for each target to that GitHub Release.

The desktop Shell consumes the archive only after it matches a checked-in lock entry. It verifies the archive SHA-256 before extraction and verifies the extracted `runtime.json` before running DSH. It has no registry fallback.

## Consequences

Core version upgrades become an explicit sequence: create a Core tag, dispatch the Runtime release workflow, record the generated target asset URL and SHA-256 in the Shell lock, then build the desktop installer. Rebuilding a Shell installer never resolves a newer Core package. A broken or unavailable locked asset fails packaging rather than silently changing the shipped agent Runtime.

Each target is assembled on its own native runner. Cross-platform archive production is not attempted from a developer Mac because the bundled Node executable and native Runtime dependencies must match the target platform.

Vendor packages and their linked dependencies are copied into the Runtime when pnpm deploy leaves a workspace link, so installed desktop applications never resolve Core files from the build machine. The fallback replaces only the config-watching HMR service when a host lacks Node's internal loader; hosts with the loader retain the full HMR implementation.
