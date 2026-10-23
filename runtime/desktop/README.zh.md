# Desktop Runtime

[English](README.md) | 中文

在匹配的平台运行 `pnpm run runtime:package --target darwin-arm64`（也支持 `darwin-x64`、`win32-x64`），构建并归档此生产依赖根。`--skip-build` 复用已有构建产物。

打包使用 pnpm 的共享锁文件 deploy 和 hoisted 安装。先把部署目录中已审核的 subprocess postinstall 审批转换成对应的 file URL，再运行生命周期脚本；其他构建审批保持不变。重建依赖前，打包流程会移除部署目录中的 Node 启动入口，让脚本在打包自带的可执行文件安装完成前使用宿主 Node；pnpm 在安装完成后重建这些入口。不要使用旧版 hoisted deploy，也不要把 workspace 源码软链接复制进产物。

写入发布元数据前，打包流程会在仓库外解压归档，拒绝断链或外部软链接，并使用归档自带的 Node、不加载源码解析钩子，导入启动所需的 Host 模块。发布 CI 在各目标平台执行此检查。用户 Profile 和会话数据位于 Runtime 之外，打包不会修改这些数据。
