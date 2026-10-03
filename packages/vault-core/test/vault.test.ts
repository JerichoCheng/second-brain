import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { localDate } from "../src/dates.js";
import { makeVault, md, put, read } from "./helpers.js";

describe("初始化与扫描", () => {
  it("生成标准目录和 schema", async () => {
    const { root, vault } = await makeVault();
    for (const d of ["inbox", "tasks", "study/corrections", "reviews/weekly", ".brain/schema"]) {
      expect((await fs.stat(path.join(root, d))).isDirectory()).toBe(true);
    }
    expect(vault.schemas.size).toBe(17);
    expect(vault.schemaErrors).toEqual([]);
  });

  it("按文件夹判断数据库，子文件夹取最长匹配", async () => {
    const { vault } = await makeVault({
      "study/corrections/q.md": md("mastery: 模糊"),
      "tasks/archive/旧任务.md": md("status: done"),
      "inbox/捕获.md": "随手记",
      "templates/任务.md": md("status: inbox"),
      ".obsidian/x.md": "忽略",
    });
    expect(vault.get("q")!.db).toBe("corrections");
    expect(vault.get("旧任务")!.db).toBe("tasks");
    expect(vault.get("捕获")!.db).toBeNull();
    expect(vault.get("任务")).toBeUndefined(); // 模板不进索引
    expect(vault.all()).toHaveLength(3);
  });

  it("YAML 写错的文件照常进索引并标记错误，不影响其他文件", async () => {
    const { vault } = await makeVault({ "tasks/坏的.md": "---\nstatus: [next\n---\n", "tasks/好的.md": md("status: next") });
    expect(vault.get("坏的")!.error).toBeTruthy();
    expect(vault.get("好的")!.data.status).toBe("next");
    await expect(vault.update("坏的", { status: "done" })).rejects.toThrow(/拒绝修改/);
  });

  it("记录重名文件", async () => {
    const { vault } = await makeVault({ "tasks/同名.md": md("status: next"), "notes/同名.md": md("kind: note") });
    expect(vault.conflicts()).toEqual([["notes/同名.md", "tasks/同名.md"]]);
  });
});

describe("新建", () => {
  it("应用默认值，关联写成带引号的 wikilink，today 换成实际日期", async () => {
    const { root, vault } = await makeVault();
    const e = await vault.create("tasks", "交作业", { fields: { project: "CITS2002", due: "today", people: ["Alice"] } });
    expect(e.path).toBe("tasks/交作业.md");
    expect(await read(root, e.path)).toBe(
      `---\nstatus: inbox\nproject: "[[CITS2002]]"\ndue: ${localDate(new Date())}\npeople: ["[[Alice]]"]\n---\n`,
    );
    expect(vault.backlinks("CITS2002")).toHaveLength(1);
  });

  it("按 schema 校验字段值", async () => {
    const { vault } = await makeVault();
    await expect(vault.create("tasks", "x", { fields: { status: "todo" } })).rejects.toThrow(/不在选项/);
    await expect(vault.create("tasks", "x", { fields: { due: "明天" } })).rejects.toThrow(/YYYY-MM-DD/);
    await expect(vault.create("tasks", "x", { fields: { project: ["[[A]]", "[[B]]"] } })).rejects.toThrow(/只能关联一个/);
    await expect(vault.create("tasks", "x", { fields: { overdue: true } })).rejects.toThrow(/计算字段/);
  });

  it("重名默认报错，可选自动加后缀", async () => {
    const { vault } = await makeVault({ "notes/会议记录.md": md("kind: meeting") });
    await expect(vault.create("tasks", "会议记录")).rejects.toThrow(/已经有/);
    const e = await vault.create("notes", "会议记录", { onConflict: "suffix" });
    expect(e.name).toBe("会议记录 (2)");
  });

  it("使用模板，并填入 {{title}}", async () => {
    const { root, vault } = await makeVault();
    await put(root, "templates/课程笔记.md", md("kind: lecture\nfavorite: false", "# {{title}}\n\n## 要点\n"));
    vault.schemas.get("notes")!.template = "templates/课程笔记.md";
    const e = await vault.create("notes", "第一周", { fields: { area: "CITS2002" } });
    expect(e.data).toEqual({ kind: "lecture", area: "[[CITS2002]]" });
    expect(e.body).toBe("# 第一周\n\n## 要点\n");
  });
});

describe("修改与删除", () => {
  it("只改指定字段，保留注释和未知字段；false 和 null 删除键", async () => {
    const { root, vault } = await makeVault({
      "tasks/t.md": "---\nstatus: next # 注释\nmy_day: true\nfrom_mail: \"[[2026-10-03 邮件日报]]\"\n---\n\n正文\n",
    });
    await vault.update("t", { status: "done", my_day: false, completed: "2026-10-03", priority: "high" });
    expect(await read(root, "tasks/t.md")).toBe(
      '---\nstatus: done # 注释\nfrom_mail: "[[2026-10-03 邮件日报]]"\ncompleted: 2026-10-03\npriority: high\n---\n\n正文\n',
    );
    await vault.update("t", { priority: null });
    expect(vault.get("t")!.data.priority).toBeUndefined();
  });

  it("以磁盘上的最新内容为准，不会覆盖外部修改", async () => {
    const { root, vault } = await makeVault({ "tasks/t.md": md("status: next") });
    await put(root, "tasks/t.md", md("status: next\npriority: low", "外部编辑器加的正文"));
    await vault.update("t", { status: "doing" });
    expect(await read(root, "tasks/t.md")).toContain("priority: low");
    expect(await read(root, "tasks/t.md")).toContain("外部编辑器加的正文");
  });

  it("并发修改同一文件不会互相覆盖", async () => {
    const { vault } = await makeVault({ "tasks/t.md": md("status: next") });
    await Promise.all([
      vault.update("t", { priority: "high" }),
      vault.update("t", { energy: "low" }),
      vault.update("t", { my_day: true }),
    ]);
    expect(vault.get("t")!.data).toMatchObject({ status: "next", priority: "high", energy: "low", my_day: true });
  });

  it("写入后不留临时文件", async () => {
    const { root, vault } = await makeVault();
    await vault.create("tasks", "a");
    await vault.update("a", { status: "next" });
    expect(await fs.readdir(path.join(root, "tasks"))).toEqual(["a.md"]);
  });

  it("删除是移到 .brain/trash", async () => {
    const { root, vault } = await makeVault({ "tasks/t.md": md("status: next") });
    const trash = await vault.remove("t");
    expect(vault.get("t")).toBeUndefined();
    expect(await read(root, trash)).toContain("status: next");
  });
});
