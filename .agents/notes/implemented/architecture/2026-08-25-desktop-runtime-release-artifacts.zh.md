# Agent Note：桌面 Runtime 发布制品

状态：已实现

[English](2026-08-25-desktop-runtime-release-artifacts.md) | 中文

## 问题

桌面 Shell 必须运行由产品负责人选定的 Core 版本，而不是在 Shell 打包时从 npm registry 解析到的任意 `@deepseek-ai/dsh` 版本。仓库检出目录可通过工作区提升依赖运行，但这种隐式解析无法证明部署后的 Runtime 已包含每个必需的可执行文件和 peer 依赖。

## 决策

`runtime/desktop` 是位于 `apps/` 之外的私有 pnpm deploy 根目录，普通 DSH npm 发布族不会发布它。它声明 Runtime 的 Node 与 pnpm 可执行文件、DSH CLI 以及部署后必需的 vendored Cordis 包。`desktop-runtime-artifact.ts` 构建 Core 检出目录，为一个原生目标部署该根目录，将部署后仍为链接的每个 vendor 包实体化，把桌面 HMR fallback 加入已部署 DSH 的依赖图，校验 Node、pnpm 与 DSH 入口，并写入带有 Core 仓库、版本、不可变 Git commit 和目标信息的 `runtime.json`。

`desktop-runtime-release.ts` 将该目录归档为 `insight-harness-runtime-<version>-<target>.tar.gz`，写入 SHA-256 sidecar，并把 Runtime 元数据复制为 Release 资产。手动触发的 `Release desktop Runtime` 工作流从指定的现有 tag 为全部支持目标构建，并将每个目标的三份文件附加到对应 GitHub Release。

桌面 Shell 仅在归档匹配检入的锁定条目后才消费它。它会在解压前校验归档 SHA-256，并在运行 DSH 前校验解压后的 `runtime.json`。不存在 registry 回退路径。

## 后果

Core 升级成为显式流程：创建 Core tag，触发 Runtime 发布工作流，在 Shell 锁文件中记录生成的目标资产 URL 与 SHA-256，然后构建桌面安装包。重新构建 Shell 安装包永远不会解析更新的 Core 包。锁定资产损坏或不可用时，打包会失败，而不会静默更改随产品交付的 agent Runtime。

每个目标在对应原生 runner 上组装。不从开发者 Mac 交叉生成多平台归档，因为随包的 Node 可执行文件与原生 Runtime 依赖必须匹配目标平台。

当 pnpm deploy 保留工作区链接时，vendor 包会被复制进 Runtime，因此已安装的桌面应用绝不会从构建机器解析 Core 文件。fallback 仅在宿主缺少 Node 内部加载器时替代配置监听 HMR 服务；具备该加载器的宿主继续使用完整 HMR 实现。
