# Desktop Runtime

English | [中文](README.zh.md)

On the matching native host, `pnpm run runtime:package --target darwin-arm64` (or `darwin-x64`, `win32-x64`) builds and archives this production dependency root. `--skip-build` reuses existing build outputs.

Packaging uses pnpm's shared-lockfile deploy with a hoisted installation. Lifecycle scripts run after the deployed workspace's reviewed subprocess postinstall approval is converted to its file URL identity; all other build approvals remain unchanged. Do not use legacy hoisted deploy or copy workspace symlinks into the artifact.

Before writing release sidecars, packaging extracts the archive outside the repository, rejects broken or external symlinks, and imports the startup Host modules using the archived Node without source resolution hooks. Release CI runs this check on each target. User Profiles and Session data are outside the Runtime and are not modified by packaging.
