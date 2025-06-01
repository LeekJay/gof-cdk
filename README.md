# GOF-CDK

<div align="center">

```
 ██████╗  ██████╗ ███████╗      ██████╗██████╗ ██╗  ██╗
██╔════╝ ██╔═══██╗██╔════╝     ██╔════╝██╔══██╗██║ ██╔╝
██║  ███╗██║   ██║█████╗█████╗ ██║     ██║  ██║█████╔╝ 
██║   ██║██║   ██║██╔══╝╚════╝ ██║     ██║  ██║██╔═██╗ 
╚██████╔╝╚██████╔╝██║          ╚██████╗██████╔╝██║  ██╗
 ╚═════╝  ╚═════╝ ╚═╝           ╚═════╝╚═════╝ ╚═╝  ╚═╝
```

![Version](https://img.shields.io/badge/版本-1.0.0-blue)
![License](https://img.shields.io/badge/许可证-MIT-green)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)

<h3>无尽冬日礼包码批量处理工具</h3>

</div>

## 📋 目录

- [GOF-CDK](#gof-cdk)
  - [📋 目录](#-目录)
  - [🚀 项目简介](#-项目简介)
  - [✨ 主要特性](#-主要特性)
  - [🛠️ 技术栈](#️-技术栈)
  - [📥 安装指南](#-安装指南)
    - [前置条件](#前置条件)
    - [安装步骤](#安装步骤)
  - [📝 使用方法](#-使用方法)
  - [⚙️ 配置详解](#️-配置详解)
  - [🔄 失败任务处理](#-失败任务处理)
  - [⚠️ 注意事项](#️-注意事项)
  - [👥 贡献指南](#-贡献指南)
  - [📄 许可证](#-许可证)
  - [⚠️ 免责声明](#️-免责声明)

## 🚀 项目简介

GOF-CDK是一个用于批量处理游戏礼包码的命令行工具，基于TypeScript开发。该工具能够高效地为多个玩家账号批量领取多个礼包码，支持并发处理、自动重试和详细的日志记录。

## ✨ 主要特性

- ✅ 支持批量处理多个礼包码和多个玩家账号
- ⏱️ 可配置的批处理大小和批次间延迟
- 🔄 自动重试机制，提高领取成功率
- 📊 详细的日志记录，包括成功、失败、超时和已领取的统计
- 🔧 基于环境变量的简单配置
- 🔍 自动识别验证码
- 💾 失败任务保存与重新处理

## 🛠️ 技术栈

- **TypeScript** - 主要开发语言
- **Axios** - HTTP请求处理
- **Crypto-JS** - 加密处理
- **Dotenv** - 环境变量管理
- **Zod** - 数据验证
- **DdddOcr** - 验证码识别

## 📥 安装指南

### 前置条件

- Node.js (v16+)
- npm 或 pnpm

### 安装步骤

1. **克隆仓库**

   ```bash
   git clone https://github.com/LeekJay/gof-cdk.git
   cd gof-cdk
   ```

2. **安装依赖**

   ```bash
   npm install
   # 或使用 pnpm
   pnpm install
   ```

3. **配置环境变量**

   ```bash
   cp .env.example .env
   ```

   编辑`.env`文件，配置必要参数。

## 📝 使用方法

1. **构建项目**

   ```bash
   npm run build
   # 或使用 pnpm
   pnpm build
   ```

2. **运行程序**

   正常处理礼包码：

   ```bash
   npm start
   # 或使用 pnpm
   pnpm start
   ```

   处理之前失败的任务：

   ```bash
   npm run start:failed
   # 或使用 pnpm
   pnpm start:failed
   ```

## ⚙️ 配置详解

在`.env`文件中可配置以下参数：

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `CDK_LIST` | 礼包码列表，多个用逗号分隔 | - |
| `FID_LIST` | 玩家ID列表，多个用逗号分隔 | - |
| `BATCH_SIZE` | 每批次处理的任务数量 | `2` |
| `BATCH_DELAY` | 批次间延迟时间（毫秒） | `3000` |
| `MAX_RETRIES` | 请求最大重试次数 | `5` |
| `TIMEOUT` | 请求超时时间（毫秒） | `20000` |
| `DEVELOPMENT_MODE` | 开发模式开关，开启后显示所有日志 | `false` |
| `API_BASE_URL` | API服务基础URL | `https://wjdr-giftcode-api.campfiregames.cn/api` |
| `SIGN_SALT` | API签名盐值 | `Uiv#87#SPan.ECsp` |

## 🔄 失败任务处理

- 系统会自动重试失败的任务，最多重试3次
- 如果验证码格式不正确（长度不为4或包含中文），会自动重试
- 所有失败的任务会保存到 `failed_tasks` 目录下，文件名格式为 `failed_tasks_YYYY-MM-DD.json`
- 可以使用 `npm run start:failed` 命令重新处理失败的任务

## ⚠️ 注意事项

- 请确保礼包码和玩家ID格式正确
- 批次大小建议设置为2-5，避免请求过于频繁触发限制
- 批次间延迟建议设置为3000毫秒以上

## 👥 贡献指南

欢迎提交Issue和Pull Request，共同改进这个项目。

1. Fork 本仓库
2. 创建您的特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交您的更改 (`git commit -m '添加了一些很棒的功能'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 打开一个Pull Request

## 📄 许可证

本项目基于MIT许可证开源，详见[LICENSE](LICENSE)文件。

## ⚠️ 免责声明

本项目仅供学习和研究目的使用，不得用于任何商业用途。使用本项目进行任何商业行为所产生的后果，需自行承担全部责任。作者不对使用本项目所导致的任何直接或间接损失负责。

请遵守相关法律法规和游戏服务条款，合理使用本工具。
