# Insight Desktop Runtime

[English](README.md) | 中文

这个私有依赖根提供 Insight Desktop Shell 使用的可搬移 Runtime。`runtime:package --target <target>` 在匹配的原生主机上构建并归档它。

部署时禁用向产物提升 workspace 包。workspace 包的别名通过 Runtime 内部的相对链接指向已部署的包文件；复制 vendor 包时排除其源码中的 `node_modules`。打包在写入发布元数据前拒绝失效链接、绝对链接以及指向 Runtime 目录外的链接。

`runtime.json` 记录 Core 版本和提交、原生目标平台，以及产物中实际包含的 Node 和 pnpm 版本。归档、SHA-256 校验文件和元数据文件共同构成一组发布资产。
