# Agent Note：桌面 Runtime 发布制品

状态：已实现

[English](2026-08-25-desktop-runtime-release-artifacts.md) | 中文

## 问题

桌面 Shell 必须运行由产品负责人选定的 Core 版本，而不是在 Shell 打包时从 npm registry 解析到的任意 `@deepseek-ai/dsh` 版本。仓库检出目录可通过工作区提升依赖运行，但这种隐式解析无法证明部署后的 Runtime 已包含每个必需的可执行文件和 peer 依赖。

## 决策

`runtime/desktop` 是位于 `apps/` 之外的私有 pnpm deploy 根目录，普通 DSH npm 发布族不会发布它。它声明 Runtime 的 Node 与 pnpm 可执行文件、DSH CLI、用于编译 Shell 所有集成的 client UI Slots 类型包，以及部署后必需的 vendored Cordis 包。`desktop-runtime-artifact.ts` 构建 Core 检出目录，为一个原生目标部署该根目录，将部署后仍为链接的每个 vendor 包实体化，把桌面 HMR fallback 加入已部署 DSH 的依赖图，校验 Node、pnpm、DSH 与 UI Slots 类型入口，并写入带有 Core 仓库、版本、不可变 Git commit 和目标信息的 `runtime.json`。

`desktop-runtime-release.ts` 将该目录归档为 `insight-harness-runtime-<version>-<target>.tar.gz`，写入 SHA-256 sidecar，并把 Runtime 元数据复制为 Release 资产。手动触发的 `Release desktop Runtime` 工作流从指定的现有 tag 为全部支持目标构建，并将每个目标的三份文件附加到对应 GitHub Release。

桌面 Shell 仅在归档匹配检入的锁定条目后才消费它。它会在解压前校验归档 SHA-256，并在运行 DSH 前校验解压后的 `runtime.json`。不存在 registry 回退路径。

桌面部署根显式包含必需的工作区 peer 依赖。Runtime 组装会从已部署的消费包位置解析每个必需的 `@deepseek-ai/*` peer，在写入发布元数据前拒绝缺失依赖；可选 peer 仍为可选。此检查可以发现被工作区开发依赖掩盖的导入阶段故障。

pnpm 11 的 legacy hoisted 部署可能将包放在源码的 `runtime/desktop/node_modules`，而非重定向后的输出目录。组装仅将部署记录中的这些包复制到缺失的输出位置，排除相对于源码的 `node_modules` 链接；依赖从部署后的提升目录解析。部署清单补丁采用原子替换，避免 pnpm 硬链接修改源码清单。

## 后果

Core 升级成为显式流程：创建 Core tag，触发 Runtime 发布工作流，在 Shell 锁文件中记录生成的目标资产 URL 与 SHA-256，然后构建桌面安装包。重新构建 Shell 安装包永远不会解析更新的 Core 包。锁定资产损坏或不可用时，打包会失败，而不会静默更改随产品交付的 agent Runtime。

每个目标在对应原生 runner 上组装。不从开发者 Mac 交叉生成多平台归档，因为随包的 Node 可执行文件与原生 Runtime 依赖必须匹配目标平台。

当 pnpm deploy 保留工作区链接时，vendor 包及其链接的依赖会被复制进 Runtime，因此已安装的桌面应用绝不会从构建机器解析 Core 文件。fallback 仅在宿主缺少 Node 内部加载器时替代配置监听 HMR 服务；具备该加载器的宿主继续使用完整 HMR 实现。

Shell 所有的 client 集成针对所选 Runtime 内的类型进行编译，其中包括 `@deepseek-ai/dsh-client-ui-slots`；它们不会解析相邻 Core 检出目录，也不会把 Core 声明复制到 Shell 仓库。Deploy 根目录只提升这条外部编译路径所需的类型包，而不会提升每个内部 client 包。

## 曾考虑的替代方案

**Shell 打包时从 registry 安装 `@deepseek-ai/dsh`。** 否决，因为 registry 解析结果可以脱离产品发布而独立变化，而且无法证明选中的包包含完整的桌面 Runtime 依赖图。

**让 Shell 直接运行相邻 Core 源码检出目录。** 否决，因为安装后的桌面应用禁止依赖开发者工作区、工作区提升依赖，也不能要求用户机器存在任一 upstream 仓库。

**从开发者 Mac 构建所有目标平台的 Runtime。** 否决，因为随包的 Node 可执行文件与原生依赖均与目标平台相关。GitHub 原生 runner 能生成可复现的平台制品，无需依赖跨平台模拟。
