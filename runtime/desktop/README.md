# Insight Desktop Runtime

English | [中文](README.zh.md)

This private dependency root supplies the portable Runtime consumed by the Insight Desktop Shell. `runtime:package --target <target>` builds and archives it on the matching native host.

Deployment disables workspace hoisting into the artifact. Workspace package aliases point to deployed package files through relative links inside the Runtime; vendored packages are copied without their source `node_modules`. Packaging rejects missing, absolute, or external links before writing release metadata.

`runtime.json` records the Core version and commit, native target, and the Node and pnpm versions actually included in the artifact. The archive, SHA-256 sidecar, and metadata sidecar form one release asset set.
