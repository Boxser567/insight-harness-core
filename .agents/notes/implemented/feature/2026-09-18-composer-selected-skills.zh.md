# Agent Note: 会话范围的输入框技能选择

Status: implemented

[English](2026-09-18-composer-selected-skills.md) | 中文

## Problem

产品技能菜单需要在发送后保留选择，且不能删除手动技能引用或改变命令语义。选择时修改草稿会将菜单状态与乐观清空行为耦合。

## Decision

输入框持有选中的名称数组，通过现有快照和操作暴露。提交在异步命令判定前固定数组。仅普通消息出口在引用序列化后添加尚不存在的原生技能引用。队列和历史保留提交文本。不修改 Host 格式或技能加载策略。

## Alternatives considered

**替换草稿：** 删除已知技能引用会移除手动引用，且输入框清空后会丢失选择。

**新增传输元数据并强制本地加载：** 企业服务可以识别现有名称引用。新协议会增加不必要的存储和服务端改动。

## Consequences

选择与输入框共用生命周期，不跨重启保留。历史不区分菜单引用与手动输入。产品菜单负责目录与单选策略；通用输入框支持多个名称。服务端识别需要独立验收。

This persistent-selection design is superseded by visible draft skill toggles. The current action is `toggleSkill(name)`; no hidden prefix or cross-message selection remains.
