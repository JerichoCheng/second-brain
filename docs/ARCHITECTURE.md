# 架构

## 总览

```
Electron 应用（React + TypeScript）
├─ 渲染进程（界面）
│   侧边栏 · 仪表盘 · 数据库视图（表格/看板/日历/列表/画廊）· 页面编辑器 · 邮件 · Inbox 审批 · 对话
│        │
│        │  contextBridge 暴露的类型化 API（界面不直接访问文件系统）
│        ▼
└─ 主进程
    ├─ vault 服务：读写 Markdown、监听文件变化、内存索引与查询
    ├─ schema：每个数据库的字段、选项、关联、视图定义
    ├─ 定时任务：邮件日报、早晚复盘、每周复盘
    ├─ mail-digest：邮件抓取与分析
    └─ Harness 桥接：以子进程运行 DeepSeek Harness，通过 ACP（stdio JSON-RPC）通信
```

## 核心设计：schema 驱动

每个数据库对应 `.brain/schema/` 下的一个 YAML 文件，描述字段、类型、选项、关联和视图（格式见 [SCHEMA.md](SCHEMA.md)）。
界面只按 schema 渲染，代码里不区分 Tasks、Books 还是 Recipes。新增模块 = 新增一个 schema 文件。

## 数据格式

**Markdown 文件是唯一的真实来源。** 内存索引在启动时扫描生成、随文件变化更新，可以随时丢弃重建。

### vault 目录

```
vault/
├─ .brain/
│   └─ schema/          # 数据库定义
├─ inbox/               # 待处理的捕获内容与 AI 提案
├─ tasks/
├─ projects/
├─ notes/
├─ areas/               # 原 Ultimate Brain 的 Tags（area / resource / entity）
├─ goals/
├─ study/
│   ├─ corrections/     # 错题本
│   └─ vocab/           # 英语词汇
├─ people/
├─ books/
├─ recipes/
├─ meals/
├─ reviews/
│   ├─ daily/
│   └─ weekly/
├─ mail/                # 每日邮件日报
├─ templates/           # 新建条目用的模板
└─ attachments/
```

### 条目文件

```markdown
---
type: task
status: next
priority: high
due: 2026-10-17
project: "[[CITS2002 Systems Programming]]"
---

正文（普通 Markdown）
```

约定：

- 文件名即标题，全库唯一，wikilink 按文件名解析
- 日期写成 `YYYY-MM-DD` 或 `YYYY-MM-DDTHH:mm`，不加引号
- 关联字段的值是 wikilink（加引号），多值用列表
- 只存储关联的一侧；反向关联（项目下的任务、领域下的笔记）由索引计算，不写入文件
- 公式和汇总（进度、逾期）不存储，查询时计算

## 安全规则

### AI 只能写 Inbox

AI 永远不直接修改正式目录。它的所有改动都以**提案**形式写进 `inbox/`，由我在审批界面确认后，由主进程（而不是 AI）执行。

这条规则在两层强制执行：

1. Harness 的 `tools/pre-execute` 钩子拒绝任何写到 `inbox/` 以外路径的工具调用
2. Harness profile 中移除 shell 等可以绕过文件工具的能力

### 提案格式

提案文件的 frontmatter = 目标条目的 frontmatter + `proposal_*` 字段：

```markdown
---
type: task
status: next
due: 2026-10-17
project: "[[CITS2002 Systems Programming]]"
proposal_action: create              # create | update | delete
proposal_target: tasks/提交 CITS2002 Project 2.md
proposal_source: "[[2026-10-03 邮件日报]]"
proposal_created: 2026-10-03T07:30
---

目标条目的正文
```

审批通过时：去掉所有 `proposal_*` 字段，按 `proposal_action` 对 `proposal_target` 执行操作，删除提案文件，做一次 git 提交。
`update` 类提案在审批界面以 diff 显示。

### 邮件只读

- IMAP 以只读方式（EXAMINE）打开收件箱，抓取使用 `BODY.PEEK`，不改变已读状态
- Microsoft Graph 只申请委托权限 `Mail.Read`
- 不发信、不删信、不移动邮件

### 密钥

- 开发阶段：`.env` 文件（已被 `.gitignore` 排除）
- 应用阶段：Electron `safeStorage` 加密后保存，不写入任何配置文件

### 隐私

邮件完整正文和被检索到的笔记内容会发送给 DeepSeek API。不希望外发的内容放在 schema 中标记为排除的目录，插件不会读取。

## 与 DeepSeek Harness 的集成

- Harness 以锁定版本的依赖打包进应用，作为子进程运行
- 应用与它之间只通过 ACP 协议通信，不调用其内部 API。Harness 处于开发者预览期、接口会变，这层隔离把它更新带来的影响限制在桥接模块里
- 自定义 profile 通过 `cordis.patch.yml` 配置：加载 vault 插件，移除 shell 工具
- 模型：日常任务（邮件分类、Inbox 整理）用 `deepseek-v4-flash`，每周复盘用 `deepseek-v4-pro`

> ⚠️ ACP 的具体消息格式尚未核实，进入阶段 6 前需对照 Harness 开发文档确认。
