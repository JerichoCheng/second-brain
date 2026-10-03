# Second Brain

一个本地优先、只给自己用的第二大脑桌面应用（Windows）。

- **类 Notion 的界面**：表格、看板、日历、列表视图，带属性面板的页面编辑器，仪表盘
- **结构来自 Ultimate Brain**：Tasks / Projects / Notes / Areas / Goals，加上学习、读书、食谱、联系人等模块，全部由 schema 文件定义
- **数据是普通 Markdown**：每个条目一个带 YAML frontmatter 的 `.md` 文件，可以用任何编辑器打开，用 git 做版本管理
- **AI 助理**：基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 调用 DeepSeek API；AI 只能往 Inbox 写提案，由我审批后才进入正式知识库
- **每日邮件分析**：读取 UWA、Gmail、QQ、163 邮箱，生成日报并提取待办

> 🚧 开发中，进度见 [docs/ROADMAP.md](docs/ROADMAP.md)

## 仓库结构

```
second-brain/
├─ apps/
│   └─ desktop/          # Electron + React 桌面应用（阶段 0 创建）
├─ packages/
│   └─ mail-digest/      # 每日邮件分析，可独立运行 ✅
└─ docs/
    ├─ ROADMAP.md        # 开发计划与进度
    ├─ ARCHITECTURE.md   # 架构、数据格式、安全规则
    ├─ SCHEMA.md         # 数据库 schema 格式规范
    └─ DECISIONS.md      # 技术决策记录
```

**代码仓库和知识库是分开的。** 本仓库只放代码；我的 vault（笔记、任务、邮件日报）放在本机单独的目录，用另一个私有 git 仓库备份。`.gitignore` 已排除 `vault/`、`.env`、`config.json`。

## 开发环境

- Windows 10/11
- Node.js 22+
- Git

```powershell
git clone https://github.com/JerichoCheng/second-brain.git
cd second-brain
npm install
npm run mail:mock     # 离线跑一遍邮件分析流程，检查环境是否正常
```

各模块的配置方法见对应目录下的 README。

## 技术栈

Electron · React · TypeScript · Vite · Tailwind CSS · TanStack Table · dnd-kit · DeepSeek Harness · imapflow · Microsoft Graph
