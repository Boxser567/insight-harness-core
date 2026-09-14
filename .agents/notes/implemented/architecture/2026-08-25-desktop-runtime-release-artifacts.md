# Agent Note: Desktop Runtime release artifacts

Status: implemented

English | [中文](2026-08-25-desktop-runtime-release-artifacts.zh.md)

## Problem

The desktop Shell must run a Core version selected by the product owner, rather than whichever `@deepseek-ai/dsh` version happens to resolve from an npm registry during Shell packaging. A repository checkout works through workspace hoisting, but that hidden resolution does not prove that a deployed Runtime contains every required executable and peer dependency.

## Decision

`runtime/desktop` is a private pnpm deploy root outside `apps/`, so the normal DSH npm release family cannot publish it. It declares the Runtime's Node and pnpm executables, the DSH CLI, the client UI Slots type package used to compile Shell-owned integrations, and the vendored Cordis packages required after deployment. `desktop-runtime-artifact.ts` builds the Core checkout, deploys that root for one native target, materializes every deployed vendor-package link, adds the desktop HMR fallback to the deployed DSH dependency graph, verifies the Node, pnpm, DSH, and UI Slots type entries, and writes `runtime.json` with the Core repository, version, immutable Git commit, and target.

`desktop-runtime-release.ts` archives that directory as `insight-harness-runtime-<version>-<target>.tar.gz`, writes a SHA-256 sidecar, and copies the Runtime metadata as a release asset. The manual `Release desktop Runtime` workflow builds all supported targets from the requested existing tag and attaches the three files for each target to that GitHub Release.

The desktop Shell consumes the archive only after it matches a checked-in lock entry. It verifies the archive SHA-256 before extraction and verifies the extracted `runtime.json` before running DSH. It has no registry fallback.

The desktop deploy root explicitly includes required workspace peer dependencies. Runtime assembly resolves each required `@deepseek-ai/*` peer from its deployed consumer and refuses missing peers before writing release metadata; optional peers remain optional. This check catches import-time failures that workspace builds hide through development dependencies.

pnpm 11 legacy hoisted deployment can place packages under the source `runtime/desktop/node_modules` instead of its redirected output. Assembly copies only those recorded package placements into missing output locations, omitting their source-relative `node_modules` links; dependencies resolve from the deployed hoisted tree. Deployment manifest patches use atomic replacement so pnpm hard links cannot modify source manifests.

The workflow also supports validation with `publish=false`: it checks out the supplied branch or tag, builds each native target, and uploads workflow artifacts without creating a Release. Publication requires an existing tag. Both modes retain the archive, checksum, and metadata for each target.

## Consequences

Core version upgrades become an explicit sequence: create a Core tag, dispatch the Runtime release workflow, record the generated target asset URL and SHA-256 in the Shell lock, then build the desktop installer. Rebuilding a Shell installer never resolves a newer Core package. A broken or unavailable locked asset fails packaging rather than silently changing the shipped agent Runtime.

Each target is assembled on its own native runner. Cross-platform archive production is not attempted from a developer Mac because the bundled Node executable and native Runtime dependencies must match the target platform.

Vendor packages and their linked dependencies are copied into the Runtime when pnpm deploy leaves a workspace link, so installed desktop applications never resolve Core files from the build machine. The fallback replaces only the config-watching HMR service when a host lacks Node's internal loader; hosts with the loader retain the full HMR implementation.

Shell-owned client integrations compile against types inside the selected Runtime, including `@deepseek-ai/dsh-client-ui-slots`; they do not resolve a sibling Core checkout or copy Core declarations into the Shell repository. The deploy root promotes only the type packages required by that external compilation path rather than every internal client package.

## Alternatives considered

**Install `@deepseek-ai/dsh` from the registry while packaging the Shell.** Rejected because registry resolution can change independently of the product release and cannot prove that the selected package includes the complete desktop Runtime dependency graph.

**Run Core directly from a source checkout beside the Shell.** Rejected because an installed desktop application must not depend on a developer workspace, workspace hoisting, or either upstream repository being present on the user's machine.

**Build every target Runtime from a developer Mac.** Rejected because the bundled Node executable and native dependencies are target-specific. Native GitHub runners provide reproducible platform artifacts without relying on cross-platform emulation.
