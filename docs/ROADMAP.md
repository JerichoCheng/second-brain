# 开发路线图

按每周约 15 小时估算，总计 3–4 个月。每个阶段结束都要有一个能运行的版本，不同时开工多个阶段。

图例：✅ 完成 · 🚧 进行中 · ⬜ 未开始

| 阶段 | 内容 | 预计 | 状态 |
|---|---|---|---|
| — | 邮件分析独立模块 | — | ✅ |
| 0 | 项目骨架 | 第 1 周 | ✅ |
| 1 | 数据层 | 第 2–3 周 | ⬜ |
| 2 | 数据库视图 | 第 4–6 周 | ⬜ |
| 3 | 页面与编辑器 | 第 7–8 周 | ⬜ |
| 4 | 工作流 | 第 9–10 周 | ⬜ |
| 5 | 邮件集成 | 第 11 周 | ⬜ |
| 6 | Agent | 第 12–13 周 | ⬜ |
| 7 | 打包发布 | 第 14 周 | ⬜ |

阶段 3 完成后就是第一个可日常使用的版本，开始用它代替 Notion，后续阶段边用边做。

---

## 已完成：邮件分析独立模块

`packages/mail-digest`，详见其 README。

- [x] IMAP 只读抓取（Gmail / QQ / 163），UIDVALIDITY + UID 增量
- [x] Microsoft Graph 只读抓取（UWA），设备代码登录
- [x] 正文清洗：HTML 转文本、去掉引用回复、截断
- [x] 本地规则过滤（发件人、主题）
- [x] DeepSeek 分批分析：分类、摘要、待办、截止日期、关联项目
- [x] 输出日报到 `mail/`，任务提案到 `inbox/`
- [x] 离线 mock 模式
- [ ] 真实邮箱测试：Gmail
- [ ] 真实邮箱测试：QQ
- [ ] 真实邮箱测试：163
- [ ] 真实邮箱测试：UWA（确认学校租户是否允许自行授权）
- [ ] 用一周真实邮件调整提示词

## 阶段 0：项目骨架

- [ ] 用 electron-vite 的 React + TypeScript 模板创建 `apps/desktop`
- [ ] 接入 Tailwind CSS 和 shadcn/ui
- [ ] 目录约定：`src/main`（主进程）、`src/renderer`（界面）、`src/shared`（共用类型）
- [ ] 通过 contextBridge 暴露带类型的 API，界面不直接访问文件系统
- [ ] 设置页：选择 vault 路径，初始化目录结构，执行 `git init`

**完成标准**：应用能启动，能选择一个空文件夹作为 vault 并生成标准目录。

## 阶段 1：数据层

界面和 agent 都依赖它，所以最先做，并且必须有测试（vitest）。

- [ ] 按 [SCHEMA.md](SCHEMA.md) 定义 schema 格式，并为所有数据库写好 schema 文件（字段、选项、关联、视图）
- [ ] vault 服务：frontmatter 解析与写回；写入时先写临时文件再重命名
- [ ] chokidar 监听文件变化，外部修改实时同步到界面
- [ ] 内存索引与查询引擎：过滤、排序、分组，支持 `today`、`this_week` 等相对日期
- [ ] 关联：wikilink 双向解析；重命名页面时自动更新所有引用
- [ ] 汇总与公式：只实现用到的几个（项目进度、是否逾期），不做通用公式引擎

**完成标准**：测试中能按 schema 查出 Today 视图的任务；重命名项目后所有引用同步更新。

## 阶段 2：数据库视图

工作量最大、最接近 Notion 体验的部分。

- [ ] 属性单元格组件：每种字段类型的显示与编辑（select、multi-select、status、date/区间、relation、checkbox、number、url）
- [ ] 表格视图（TanStack Table）：单元格内编辑、调整列宽、隐藏列
- [ ] 看板视图（dnd-kit）：按 status/select 分列，拖拽即修改字段
- [ ] 日历视图：按日期字段排布，拖拽改日期
- [ ] 列表视图、画廊视图
- [ ] 视图工具栏：临时过滤/排序/分组，可另存为新视图写回 schema
- [ ] 新建条目：从模板创建，按当前视图自动填默认值

**完成标准**：Tasks 的 Today、Next 7 Days、按项目分组、看板、日历视图都可用，编辑结果写回 Markdown。

## 阶段 3：页面与编辑器

- [ ] **先做编辑器选型实验**：Milkdown 或带 Markdown 序列化的 TipTap，测试「Markdown → 编辑 → Markdown」往返是否变形
- [ ] 页面布局：标题 + 属性面板（复用阶段 2 组件）+ 正文
- [ ] 正文编辑器接入
- [ ] 输入 `[[` 弹出页面搜索并插入链接；页面底部显示反向链接
- [ ] 页面内嵌视图（如项目页中的任务表）
- [ ] 粘贴图片自动存入 `attachments/`

**完成标准**：能完全在应用内写一篇课程笔记——设置属性、链接项目、插入截图——生成的 Markdown 干净可读。

## 阶段 4：工作流

- [ ] 仪表盘：可配置小组件（Task Inbox、Note Inbox、今日任务、进行中项目、快速操作）
- [ ] Quick Capture：全局快捷键弹出小窗，内容存入 `inbox/`
- [ ] 重复任务：完成时按规则生成下一次
- [ ] My Day 引导页：Plan → Execute → Wrap Up
- [ ] My Week 引导页：Clear → Reflect → Plan
- [ ] GTD 处理视图：逐条处理 inbox（转任务 / 转笔记 / 归档 / 删除）
- [ ] 归档：`archived: true` 的条目默认从视图隐藏

## 阶段 5：邮件集成

- [ ] mail-digest 移入主进程，内置定时器，错过的运行在启动时补跑
- [ ] 账户管理界面；密码与令牌改用 Electron safeStorage 加密保存
- [ ] 邮件页：按日期浏览日报，单封邮件「转成任务」
- [ ] UWA 登录改为应用内弹窗显示设备代码

## 阶段 6：Agent

- [ ] Harness 自定义 profile：移除 shell 工具，加载 vault 插件
- [ ] vault 插件工具：`search_notes`、`read_note`、`query`（按 schema 查询）、`propose_change`
- [ ] pre-execute 钩子：拒绝一切写到 `inbox/` 以外的操作
- [ ] 主进程通过 ACP（stdio JSON-RPC）与 Harness 通信
- [ ] 右侧可收起的对话面板
- [ ] Inbox 审批页：diff 显示，批准 / 修改后批准 / 拒绝；批准后写入并 git 提交
- [ ] 定时 agent 任务：早间计划、晚间 Wrap Up、每周复盘，结果以提案进 Inbox

## 阶段 7：打包发布

- [ ] electron-builder 生成 Windows NSIS 安装包
- [ ] 托盘常驻、开机自启、单实例锁
- [ ] Harness 作为锁定版本依赖打包，以 `ELECTRON_RUN_AS_NODE` 运行
- [ ] 本地日志与崩溃记录
- [ ] vault 每日自动 git 提交作为备份

## 之后按需

视图引擎完成后，以下模块基本只需写 schema 文件：

- [ ] Study：错题本、英语词汇
- [ ] Books + 阅读记录
- [ ] Recipes + 餐计划 + 采购清单
- [ ] People
- [ ] Creator's Companion
