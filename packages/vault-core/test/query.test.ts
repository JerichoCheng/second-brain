import { describe, expect, it } from "vitest";
import { makeVault, md, names } from "./helpers.js";

const ctx = { today: "2026-10-03", now: new Date("2026-10-03T12:00:00+08:00") };

const TASKS = {
  "projects/CITS2002.md": md("status: active"),
  "projects/MATH1722.md": md("status: active"),
  "tasks/逾期的低优先级.md": md("status: next\npriority: low\ndue: 2026-10-01\nproject: \"[[CITS2002]]\""),
  "tasks/今天到期.md": md("status: next\npriority: high\ndue: 2026-10-03\nproject: \"[[cits2002]]\""),
  "tasks/今晚六点.md": md("status: doing\npriority: high\ndue: 2026-10-03T18:00"),
  "tasks/加入了 My Day.md": md("status: next\npriority: medium\nmy_day: true\nproject: \"[[MATH1722]]\""),
  "tasks/没有优先级.md": md("status: next\ndue: 2026-10-02"),
  "tasks/已完成.md": md("status: done\npriority: high\ndue: 2026-10-02\ncompleted: 2026-10-02"),
  "tasks/下周.md": md("status: next\npriority: high\ndue: 2026-10-05\nproject: \"[[CITS2002]]\""),
  "tasks/延后了.md": md("status: next\nmy_day: true\nsnooze: 2026-10-10"),
  "tasks/延后到今天.md": md("status: next\npriority: low\ndue: 2026-09-30\nsnooze: 2026-10-03"),
  "tasks/收件箱.md": md("status: inbox"),
  "tasks/等人回复.md": md("status: waiting\nwait: 2026-10-08\npeople: [\"[[Alice]]\"]"),
};

describe("Tasks 视图（阶段 1 完成标准）", () => {
  it("Today：My Day 或今天及以前到期，未完成，未被延后；按优先级、截止日期排序", async () => {
    const { vault } = await makeVault(TASKS);
    const { entries } = vault.query("tasks", "Today", ctx);
    expect(names(entries)).toEqual([
      "今天到期", "今晚六点", // high：先按日期，再按时间
      "加入了 My Day", // medium
      "延后到今天", "逾期的低优先级", // low：9-30 早于 10-01
      "没有优先级", // 空值排最后
    ]);
  });

  it("Next 7 Days 按日期分组", async () => {
    const { vault } = await makeVault(TASKS);
    const { groups } = vault.query("tasks", "Next 7 Days", ctx);
    expect(groups!.map((g) => [g.key, names(g.entries)])).toEqual([
      ["2026-10-03", ["今天到期", "今晚六点"]],
      ["2026-10-05", ["下周"]],
    ]);
  });

  it("按项目分组：链接大小写不同也归到同一个项目，分组名用文件名", async () => {
    const { vault } = await makeVault(TASKS);
    const { groups } = vault.query("tasks", "按项目", ctx);
    const byKey = Object.fromEntries(groups!.map((g) => [g.key, names(g.entries)]));
    expect(byKey["CITS2002"]).toEqual(["今天到期", "下周", "逾期的低优先级"]);
    expect(byKey["MATH1722"]).toEqual(["加入了 My Day"]);
    expect(groups!.at(-1)!.key).toBeNull(); // 没有项目的排最后
  });

  it("看板：按 options 顺序分列，空列也保留，隐藏 done", async () => {
    const { vault } = await makeVault(TASKS);
    const { groups, entries } = vault.query("tasks", "看板", ctx);
    expect(groups!.map((g) => g.key)).toEqual(["inbox", "next", "doing", "waiting", "someday"]);
    expect(groups!.find((g) => g.key === "someday")!.entries).toEqual([]);
    expect(names(entries)).not.toContain("已完成");
  });

  it("关联字段按人分组", async () => {
    const { vault } = await makeVault(TASKS);
    const { groups } = vault.query("tasks", "等待中", ctx);
    expect(groups!.map((g) => [g.key, names(g.entries)])).toEqual([["Alice", ["等人回复"]]]);
  });
});

describe("过滤", () => {
  it("is 可以给多个值（任一匹配）", async () => {
    const { vault } = await makeVault(TASKS);
    const r = vault.query("tasks", { name: "t", type: "list", filter: [["status", "is", ["doing", "waiting"]]] }, ctx);
    expect(names(r.entries).sort()).toEqual(["今晚六点", "等人回复"]);
  });

  it("嵌入视图用 $this 指代当前页面", async () => {
    const { vault } = await makeVault(TASKS);
    const view = { name: "项目任务", type: "list" as const, filter: [["project", "is", "$this"] as [string, "is", string]] };
    const r = vault.query("tasks", view, { ...ctx, self: "CITS2002" });
    expect(names(r.entries).sort()).toEqual(["下周", "今天到期", "逾期的低优先级"].sort());
  });

  it("关联值可以写成 [[名字]]", async () => {
    const { vault } = await makeVault(TASKS);
    const r = vault.query("tasks", { name: "t", type: "list", filter: [["project", "is", "[[MATH1722]]"]] }, ctx);
    expect(names(r.entries)).toEqual(["加入了 My Day"]);
  });

  it("文本 contains 不区分大小写；is_empty", async () => {
    const { vault } = await makeVault({
      "notes/Pointers in C.md": md("kind: lecture"),
      "notes/随手记.md": md("kind: note\narea: \"[[Academics]]\""),
    });
    const contains = vault.query("notes", { name: "t", type: "list", filter: [["name", "contains", "POINTER"]] });
    expect(names(contains.entries)).toEqual(["Pointers in C"]);
    expect(names(vault.query("notes", "待整理").entries)).toEqual(["Pointers in C"]);
  });

  it("归档的条目默认隐藏，过滤条件提到 archived 时才显示", async () => {
    const { vault } = await makeVault({
      "projects/旧项目.md": md("status: active\narchived: true"),
      "projects/新项目.md": md("status: active"),
    });
    expect(names(vault.query("projects", "进行中").entries)).toEqual(["新项目"]);
    const r = vault.query("projects", { name: "归档", type: "list", filter: [["archived", "is", true]] });
    expect(names(r.entries)).toEqual(["旧项目"]);
  });

  it("日期 within 本季度", async () => {
    const { vault } = await makeVault({
      "goals/拿到实习.md": md("status: active\ndeadline: 2026-12-01"),
      "goals/申请港硕.md": md("status: active\ndeadline: 2027-01-15"),
    });
    expect(names(vault.query("goals", "本季度", ctx).entries)).toEqual(["拿到实习"]);
    expect(names(vault.query("goals", "今年", ctx).entries)).toEqual(["拿到实习"]);
  });
});

describe("排序", () => {
  it("降序时空值仍在最后", async () => {
    const { vault } = await makeVault({
      "books/A.md": md("status: read\nfinished: 2026-01-01"),
      "books/B.md": md("status: read"),
      "books/C.md": md("status: read\nfinished: 2026-05-01"),
    });
    expect(names(vault.query("books", "已读").entries)).toEqual(["C", "A", "B"]);
  });
});
