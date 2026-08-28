# Agent Note: 桌面产品分支的 CI 范围

Status: implemented

[English](2026-08-28-desktop-fork-ci-scope.md) | 中文

## 问题

Insight 桌面产品分支只交付 macOS 与 Windows 产品，但继承的 Core 工作流会在每次 `master` 推送后自动占用托管资源执行 Linux 沙箱矩阵与 npm 包排练。macOS Sandbox 工作流还会在 Seatbelt 验证前运行完整单元测试，因此无关的 PowerShell 时序故障可能阻止平台沙箱检查启动。另一个 Runtime 制品测试读取被忽略的 vendor 构建输出，所以只会在曾经执行过构建的检出目录中通过。

## 决策

`sandbox.yml` 保留自动 macOS 作业，并将其限制为洁净检出环境下的桌面 Runtime 制品测试与两个真实 Seatbelt E2E 文件。bwrap 与 Landlock 作业仍可使用，但只允许通过 `workflow_dispatch` 手动执行。现有 Windows master 工作流继续负责原生 PowerShell 覆盖，`runtime-release.yml` 继续作为 `darwin-arm64`、`darwin-x64` 与 `win32-x64` 制品的发布路径。

本产品分支中的 `release.yml`、`release-vendor.yml` 与 `landlock-run.yml` 改为手动工作流。其作业内容保持不变，因此同步 upstream、排练依赖发布或明确调查 Linux 问题时仍能运行继承的覆盖范围，而无需让每次产品推送都承担这些成本。

Runtime 实体化单元测试改为验证受 Git 跟踪的 vendor 源文件，不再依赖被忽略的 `vendor/*/lib` 输出。生产组装器仍会在部署前构建 official 制品，已有构建制品检查继续验证真实发布路径。

## 曾考虑的替代方案

**停用所有继承的 Core 工作流。** 这样能最大幅度降低 Actions 使用量，但会失去保护受支持桌面平台的 macOS 沙箱与 Windows 兼容性信号。

**继续自动运行完整 Sandbox 矩阵。** 这样能在每次推送时保持 upstream 覆盖，但会把产品迭代时间花在 Linux 专属机制上，也会让无关完整测试故障遮蔽 macOS 沙箱结果。

**删除 Linux 与 npm 工作流。** 删除会增加后续同步 upstream 的难度，并移除有价值的手动诊断能力。保留作业并要求显式触发，既保存能力也避免自动消耗。

## 测试

洁净检出回归测试证明 `desktop-runtime-artifact.spec.ts` 不依赖被忽略的 vendor 构建输出。工作流结构测试固定自动 macOS 命令、仅可手动触发的 Linux 与 npm 流程，以及 Runtime 发布目标清单。两个 Seatbelt E2E 文件通过真实宿主的 `sandbox-exec` 运行，并拒绝平台验证自行跳过产生的假绿。

## 后果

产品推送会把托管资源投入受支持的 macOS 沙箱路径与现有 Windows 路径，而不再自动执行 Linux 与 npm 发布排练。Linux 与 npm 回归可能要到维护者手动运行工作流或准备 upstream 同步时才会被发现。自动 macOS 作业不提供整个仓库的 Darwin 对等验证；它只证明受支持的桌面制品与 Seatbelt 路径，更广泛的 macOS 检查属于显式维护动作。
