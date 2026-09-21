# Agent Note: Windows 普通 Job 目标的无窗口执行

Status: proposed

[English](2026-09-21-windows-windowless-job-target.md) | 中文

## 问题

SW_HIDE 仍然保留控制台窗口对象，桌面端重复调用 PowerShell 时仍可能引发任务栏变化。只检查 IsWindowVisible 无法区分这种情况与无窗口执行。

## 提案

仅对普通 CreateProcessW Job 目标使用 CREATE_NO_WINDOW。普通沙箱 runner 随后拥有供受限子进程继承的控制台上下文。CreateProcessAsUserW 的标志保持不变，因为受限控制台分配曾导致 DLL 初始化失败。挂起创建、Job 分配、承载描述符和取消机制保持不变。

## 考虑过的替代方案

**受限目标标志：** 不采用，因为现有 ACL 沙箱已记录 CREATE_NO_WINDOW 和 CREATE_NEW_CONSOLE 导致 STATUS_DLL_INIT_FAILED。

**持久控制台 broker：** 仅在原生继承测试失败时考虑；它会增加本次小范围候选修改不具备的进程归属与关闭机制。

## 验收标准

原生测试必须验证普通后代和两种受限模式均不存在控制台窗口、重复执行 PowerShell 成功，以及取消、输出和写限制行为不变。Windows 10/11 交互桌面验收必须另外确认任务栏不再频繁变化。上述检查通过前不修改运行时发布指针。

## 风险

此候选方案依赖受限子进程能够继承可用的无窗口控制台上下文。macOS 单元测试无法确定该 Windows 行为；原生测试失败时应阻止推广，不能放宽断言。
