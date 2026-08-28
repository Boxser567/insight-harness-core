# Agent Note: 空设置触发器保留对话框宿主

Status: implemented

[English](2026-08-28-null-settings-trigger-preserves-dialog-host.md) | 中文

## 问题

设置外壳占用单一 `sidebar.settings` slot，同时持有可见触发行和已挂载的 `SettingsDialogController` 连接。部署方若为删除重复触发行而替换整个 slot，也会卸载控制器连接，导致其他插件调用 `ctx.settingsDialog.open()` 时失败，无法打开共享设置面板。

## 决策

`SettingsRoot` 继续作为 `sidebar.settings` 注册方，并把包含按钮框架与 `openDialog` 回调在内的完整触发行交给 `settings.trigger`。随包提供的 `TriggerContent` 注册方渲染标准按钮；注册方返回 null 时只隐藏该行，不卸载 `SettingsRoot`、设置面板、首次使用引导协调或 `SettingsDialogController` 连接。部署方通过公开 `settings.trigger` slot 定制可见性，并保持设置外壳注册。

## 考虑过的替代方案

**用空组件替换 `sidebar.settings`。** 否决，因为该单一 slot 同时拥有对话框宿主和触发行；替换它会移除其他入口依赖的服务连接。

**通过 CSS 或 DOM 修改隐藏触发器。** 否决，因为这会依赖私有标记并绕过 slot 生命周期，使仅涉及布局的偏好依赖实现细节。

**把对话框宿主拆成独立根插件。** 否决，因为让 `settings.trigger` 持有完整行已能提供所需分离，无需增加生命周期所有者或改变现有注册拓扑。

## 后果

活动 `settings.trigger` 贡献返回 null 具有明确的呈现效果，默认注册方保留现有触发器行为。替代设置入口可以隐藏侧栏触发行，并继续通过 `ctx.settingsDialog` 打开任意已注册分区。设置外壳与触发器内容的 client 测试固定触发行缺失、对话框服务保持挂载以及默认按钮行为。
