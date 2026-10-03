# @second-brain/vault-core

vault 数据层：schema、frontmatter 读写、内存索引、查询、关联、计算字段、文件监听。

不依赖 Electron，主进程、agent 插件和测试都直接用它。格式规范见 [docs/SCHEMA.md](../../docs/SCHEMA.md)。

## 用法

```ts
import { initVault, Vault } from "@second-brain/vault-core";

await initVault("D:/vault");                 // 建目录、复制默认 schema（可重复执行）
const vault = await Vault.open("D:/vault");  // 加载 schema、扫描全部文件建索引
if (vault.schemaErrors.length) console.warn(vault.schemaErrors);

// 查询：schema 里的视图名，或临时的视图定义
const { entries } = vault.query("tasks", "Today");
const { groups } = vault.query("tasks", "按项目");
vault.query("tasks", { name: "项目任务", type: "table", filter: [["project", "is", "$this"]] }, { self: "CITS2002" });

// 字段值（已按类型规整，含计算字段）
vault.value(vault.get("CITS2002")!, "progress"); // 0.33

// 写入：都是原子写入，并立即更新索引
await vault.create("tasks", "交 Project 2", { fields: { project: "CITS2002", due: "2026-10-17" } });
await vault.update("交 Project 2", { status: "done", completed: "today" });
await vault.rename("CITS2002", "CITS2002 Systems Programming"); // 全库链接同步更新
await vault.remove("交 Project 2");                            // 移到 .brain/trash/

// 反向链接、断链、重名
vault.backlinks("CITS2002 Systems Programming");
vault.danglingLinks();
vault.conflicts();

// 监听外部修改
vault.on("event", (e) => { /* add | change | unlink | schema */ });
await vault.watch();
```

## 约定

- Markdown 文件是唯一的真实来源，索引随时可以丢弃重建
- 文件名即标题，全库唯一，**不区分大小写**（Windows 文件系统也不区分）
- 修改只动 patch 里的键，其他键的顺序、注释、未知字段原样保留；CRLF 文件保持 CRLF
- 修改总是基于磁盘上的最新内容，不会覆盖外部编辑器刚做的修改；同一文件的并发修改会排队
- YAML 写坏的文件照常进索引（`entry.error` 有值），但拒绝修改，避免丢数据
- 自己写入的文件不会再触发一次监听事件
- `templates/` 和以 `.` 开头的文件夹不进索引

## 开发

```bash
npm test            # vitest，测试固定在 Australia/Perth 时区
npm run typecheck
npm run build       # 输出到 dist/
```

在 5000 个任务的 vault 上：启动扫描约 1.3 秒，Today 视图查询约 50 毫秒，重命名一个被 100 个文件引用的项目约 80 毫秒。
