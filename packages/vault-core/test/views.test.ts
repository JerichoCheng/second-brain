import { describe, expect, it } from "vitest";
import { removeViewText, upsertViewText } from "../src/schema-write.js";
import { makeVault, put, read } from "./helpers.js";

const SCHEMA = `name: 任务
folder: tasks

fields:
  status: { type: status, options: [inbox, next, done] }
  due:    { type: date }

views:
  # 收件箱
  - name: Inbox
    type: list
    filter: [[status, is, inbox]]

  - name: 全部
    type: table
`;

describe("upsertViewText", () => {
  it("追加视图：条件写在一行，原有注释和格式不变", () => {
    const out = upsertViewText(SCHEMA, {
      name: "本周",
      type: "list",
      filter: [["due", "within", "this_week"]],
      sort: ["-due"],
    });
    expect(out.startsWith(SCHEMA)).toBe(true);
    expect(out).toContain(`
  - name: 本周
    type: list
    filter: [[due, within, this_week]]
    sort: [-due]
`);
  });

  it("多个条件和 any 分行写", () => {
    const out = upsertViewText(SCHEMA, {
      name: "Today",
      type: "list",
      filter: [["status", "is_not", "done"], { any: [["due", "on_or_before", "today"], ["due", "is_empty"]] }],
    });
    expect(out).toContain(`    filter:
      - [status, is_not, done]
      - any: [[due, on_or_before, today], [due, is_empty]]
`);
  });

  it("原位替换并保留上方注释，去掉空值", () => {
    const out = upsertViewText(
      SCHEMA,
      { name: "收件箱", type: "board", group: "status", filter: [], hide: ["done"], include_archived: false },
      "Inbox",
    );
    expect(out).toContain(`  # 收件箱
  - name: 收件箱
    type: board
    group: status
    hide: [done]

  - name: 全部`);
    expect(out).not.toContain("filter");
    expect(out).not.toContain("include_archived");
  });

  it("删除视图：连同上方注释，不留多余空行", () => {
    expect(removeViewText(SCHEMA, "全部")).toBe(SCHEMA.replace("\n  - name: 全部\n    type: table\n", ""));
    expect(removeViewText(SCHEMA, "Inbox")).toBe(
      SCHEMA.replace("  # 收件箱\n  - name: Inbox\n    type: list\n    filter: [[status, is, inbox]]\n\n", ""),
    );
  });

  it("没有 views 时新建", () => {
    const out = upsertViewText("name: x\nfolder: x\n", { name: "全部", type: "table" });
    expect(out).toBe("name: x\nfolder: x\n\nviews:\n  - name: 全部\n    type: table\n");
  });

  it("保持 CRLF", () => {
    const out = upsertViewText(SCHEMA.replace(/\n/g, "\r\n"), { name: "x", type: "list" });
    expect(out.replace(/\r\n/g, "")).not.toContain("\n");
  });
});

describe("Vault.saveView", () => {
  it("写回 schema 文件并立即生效", async () => {
    const { root, vault } = await makeVault();
    await put(root, ".brain/schema/tasks.yaml", SCHEMA);
    await vault.reloadSchemas();

    const schema = await vault.saveView("tasks", { name: "下周", type: "list", filter: [["due", "within", "next_week"]] });
    expect(schema.views.map((v) => v.name)).toEqual(["Inbox", "全部", "下周"]);
    expect(vault.schemaOf("tasks").views.at(-1)?.filter).toEqual([["due", "within", "next_week"]]);
    expect(await read(root, ".brain/schema/tasks.yaml")).toContain("# 收件箱");

    await vault.saveView("tasks", { name: "下下周", type: "list" }, "下周");
    expect(vault.schemaOf("tasks").views.map((v) => v.name)).toEqual(["Inbox", "全部", "下下周"]);

    await vault.deleteView("tasks", "下下周");
    expect(vault.schemaOf("tasks").views.map((v) => v.name)).toEqual(["Inbox", "全部"]);
  });

  it("拒绝重名、空名和引用不存在字段的视图，文件不变", async () => {
    const { root, vault } = await makeVault();
    await put(root, ".brain/schema/tasks.yaml", SCHEMA);
    await vault.reloadSchemas();

    await expect(vault.saveView("tasks", { name: "全部", type: "list" })).rejects.toThrow("已经有");
    await expect(vault.saveView("tasks", { name: " ", type: "list" })).rejects.toThrow("不能为空");
    await expect(vault.saveView("tasks", { name: "坏", type: "list", sort: ["nope"] })).rejects.toThrow("排序字段 nope");
    await expect(vault.saveView("tasks", { name: "坏", type: "board", group: "due" })).rejects.toThrow("看板");
    expect(await read(root, ".brain/schema/tasks.yaml")).toBe(SCHEMA);
  });

  it("改名时可以保留原名", async () => {
    const { root, vault } = await makeVault();
    await put(root, ".brain/schema/tasks.yaml", SCHEMA);
    await vault.reloadSchemas();
    await vault.saveView("tasks", { name: "Inbox", type: "table", columns: ["name", "due"] }, "Inbox");
    expect(vault.schemaOf("tasks").views[0]).toEqual({
      name: "Inbox",
      type: "table",
      columns: ["name", "due"],
    });
  });
});
