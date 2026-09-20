<p align="center">
  <strong>简体中文</strong> |
  <a href="README.en.md">English</a> |
  <a href="README.ja.md">日本語</a>
</p>

<p align="center">
  <img src="src/assets/logo.jpg" width="112" alt="EasyCLIProxyAPI Logo">
</p>

<h1 align="center">EasyCLIProxyAPI</h1>

<p align="center">
  面向全生态 AI 智能体的现代化图形桌面控制台与本地代理中心。<br>
  为自由与高效而生，一站式释放大模型生产力。
</p>

## 项目简介

EasyCLIProxyAPI 是基于 [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) 深度定制与增强的跨平台桌面客户端。它将内核生命周期管理、多账号 OAuth 授权、API Provider 聚合接入、跨协议动态转换、模型别名系统、智能体客户端生态配置与使用分析深度整合于一体。

本版本加入了云端快照同步、全局命令面板、内置测试场、主流 IDE 一键集成、全链路测速与后台配额监控等专属定制功能，为开发者提供开箱即用的本地中继与大模型调度体验。

## 专属定制特性

- **全局命令面板（Command Palette）**：支持随时通过快捷键快速唤起。支持页面瞬间直达、一键启停/重启内核、快速复制各协议 API 地址以及即时切换深浅色主题。
- **端到端加密云端同步（Cloud Sync）**：支持对接 Cloudflare R2 及 AWS S3 兼容对象存储。所有敏感配置与密钥均在客户端经由主密码执行高强度加密，安全实现多设备间一键备份、云端拉取与配置漫游。
- **内置 AI 模型测试场（Playground）**：无需打开外部应用即可在桌面端直接测试已聚合的任何模型。实时计算首字延迟（TTFT）、生成速率（TPS）及总耗时，完整呈现深度思考与推理折叠块。
- **一键 IDE 集成中心（IDE Integration Hub）**：为 Cursor、Cline / Roo Code、Continue、Aider / Terminal CLI 与 Cherry Studio 等主流开发工具提供一键生成与即插即用的配置模板及环境变量。
- **全链路 Provider 测速（Ping & Latency Detection）**：支持对所有添加的上游 Provider 展开一键全链路健康探测与毫秒级延迟测量，自动标记延迟档位。
- **智能体工作流推荐配方（Agent Recipes & Presets）**：内置针对 Claude Code、Cursor、OpenCode 的热门模型与参数组合推荐，支持快速隐藏未安装的客户端。
- **后台配额静默自动刷新（Quota Auto Refresh）**：支持灵活配置定时间隔，后台自动同步检测各凭证剩余配额，免除频繁手动刷新的繁琐操作。
- **现代科技质感界面（Tech Blue Pro）**：采用全新科技蓝与高对比度界面布局，搭载沉浸式能量反应堆核心运转指示环，视觉清晰且无多余光污染。
- **开发者接入代码生成器**：首页内置 cURL、Python、Node.js 与 .env 完整调用范例，点击即可复制即用代码。

## 功能导览

### 1. 核心看板与快捷控制

- 启动、关闭、重启与平滑重载内核进程，实时显示反应堆状态环、进程 PID 与运行状态。
- 一键复制本地 OpenAI、Claude 与 Gemini 兼容接口地址及管理密钥。
- 首页集成常用开发语言接入代码片段与主流开发环境快速配置中心。
- 全局快捷键（`Ctrl+K` 或 `Cmd+K`）调出命令面板，支持键盘流极速操作。

### 2. AI 模型测试场 (Playground)

- 桌面端直接进行多轮对话测试与模型响应质量校验。
- 完整支持系统提示词、温度值调节与实时流式输出。
- 智能捕获并展示关键遥测指标，包含首字响应时间（TTFT）、Token 吐出速度（TPS）与流耗时。
- 深度适配带有思维链的模型（如 DeepSeek-R1、Claude 思考模式），支持折叠与展开思考内容。

### 3. 多端加密同步 (Cloud Sync)

- 配置 Cloudflare R2 / S3 存储桶与私有加密凭证。
- 在本地完成 AES 端到端强加密打包，杜绝第三方窥探。
- 可选择同步范围：包含或排除 API Key、智能体配置、模型别名及已授权 OAuth 文件。
- 多台开发设备间一键上传快照并拉取还原。

### 4. OAuth 账号授权管理

集中管理主流厂商的浏览器授权与凭证自动维护：

- Codex OAuth
- Claude OAuth
- Antigravity OAuth
- Kimi OAuth
- xAI OAuth

支持浏览器自动重定向捕获，同时提供完善的手动回调流程以应对特定网络隔离环境。

### 5. API 接入与 Provider 聚合

- 统一聚合管理 Codex、OpenAI 兼容接口、DeepSeek、Claude、Gemini 等各类上游服务。
- 一键全链路批量 Ping 测速，精准定位网络瓶颈。
- 自动进行 OpenAI、Claude 与 Gemini 之间的请求与响应协议互转。
- 灵活的模型别名映射（Alias Routing），使客户端只需调用标准名称即可自动路由到目标 Provider 与特定推理等级。

### 6. 智能体客户端生态配置

自动识别本机已安装的 AI 桌面软件及命令行工具，支持一键连接本地代理服务：

- Claude Code 与 Claude Desktop
- Cursor 与 Windsurf
- Codex、OpenCode 与 OpenClaw
- Hermes Agent、ZCode、Kimi Code 与 Grok Build
- Roo Code、Cline 与 Continue

支持同步模型列表、应用常用工作流配方、配置前自动备份原始设置以及随时一键恢复。

### 7. 使用监控与 Token 分析

- 实时跟踪请求总数、Token 消耗构成（输入、输出、思考链与上下文缓存命中）。
- 精准记录请求吞吐速率（TPS）与预估费用成本。
- 支持按时间范围、模型名称、Provider 渠道、调用来源与返回状态进行快速过滤。

## 快速开始

1. 从 [Releases 页面](https://github.com/Aurora326/EasyCLIProxyAPI/releases) 下载适合当前操作系统的预编译安装包。
2. 解压运行（Windows / Linux）或挂载 DMG 并拖入应用程序（macOS）。
3. 启动 EasyCLIProxyAPI。
4. 进入 **版本管理** 安装最新版本的代理内核。
5. 返回首页启动内核，即可直接开始使用本地 API，或在 **模型测试** 页面即刻发起对话。

## 快捷键参考

| 快捷键 | 功能 |
| --- | --- |
| `Ctrl + K` / `Cmd + K` | 打开 / 关闭全局命令面板 |
| `Esc` | 退出浮层或关闭对话框 |
| `Enter` | 命令面板确认选中项 / 测试场发送消息 |
| `Shift + Enter` | 测试场换行输入 |

## 运行环境与平台支持

支持主流桌面系统架构：

- **Windows**: x86_64、aarch64
- **macOS**: Apple Silicon (M 系列)、Intel
- **Linux**: x86_64、aarch64

