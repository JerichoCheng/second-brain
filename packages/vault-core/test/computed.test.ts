import { describe, expect, it } from "vitest";
import { makeVault, md } from "./helpers.js";

const ctx = { today: "2026-10-03", now: new Date("2026-10-03T12:00:00+08:00") };

describe("计算字段", () => {
  it("项目进度 = 已完成任务 / 全部任务；任务数", async () => {
    const { vault } = await makeVault({
      "projects/P.md": md("status: active"),
      "projects/空项目.md": md("status: active"),
      "tasks/t1.md": md("status: done\nproject: \"[[P]]\""),
      "tasks/t2.md": md("status: next\nproject: \"[[P]]\""),
      "tasks/t3.md": md("status: next\nproject: \"[[P]]\""),
      "notes/只在正文提到 P.md": md("kind: note", "参见 [[P]]"),
    });
    const p = vault.get("P")!;
    expect(vault.value(p, "progress")).toBeCloseTo(1 / 3);
    expect(vault.value(p, "tasks")).toBe(3);
    expect(vault.value(p, "notes")).toBe(0); // 正文链接不算关联
    expect(vault.value(vault.get("空项目")!, "progress")).toBeNull();
  });

  it("目标进度来自项目", async () => {
    const { vault } = await makeVault({
      "goals/G.md": md("status: active"),
      "projects/a.md": md("status: done\ngoal: \"[[G]]\""),
      "projects/b.md": md("status: active\ngoal: \"[[G]]\""),
    });
    expect(vault.value(vault.get("G")!, "progress")).toBe(0.5);
  });

  it("逾期：日期已过且未完成；带时间的按时刻比较", async () => {
    const { vault } = await makeVault({
      "tasks/昨天.md": md("status: next\ndue: 2026-10-02"),
      "tasks/昨天但完成了.md": md("status: done\ndue: 2026-10-02"),
      "tasks/今天.md": md("status: next\ndue: 2026-10-03"),
      "tasks/今天上午.md": md("status: next\ndue: 2026-10-03T09:00"),
      "tasks/今天晚上.md": md("status: next\ndue: 2026-10-03T21:00"),
      "tasks/没日期.md": md("status: next"),
    });
    const od = (n: string) => vault.value(vault.get(n)!, "overdue", ctx);
    expect([od("昨天"), od("昨天但完成了"), od("今天"), od("今天上午"), od("今天晚上"), od("没日期")])
      .toEqual([true, false, false, true, false, false]);
  });

  it("计算字段可以用来过滤", async () => {
    const { vault } = await makeVault({
      "tasks/a.md": md("status: next\ndue: 2026-10-01"),
      "tasks/b.md": md("status: next\ndue: 2026-10-09"),
    });
    const r = vault.query("tasks", { name: "逾期", type: "list", filter: [["overdue", "is", true]] }, ctx);
    expect(r.entries.map((e) => e.name)).toEqual(["a"]);
  });

  it("自定义状态的完成值（错题本：已掌握）", async () => {
    const { vault } = await makeVault({
      "study/corrections/q1.md": md("mastery: 已掌握\nnext_review: 2026-10-01"),
      "study/corrections/q2.md": md("mastery: 模糊\nnext_review: 2026-10-01"),
      "study/corrections/q3.md": md("mastery: 未掌握"),
    });
    const r = vault.query("corrections", "待复习", ctx);
    expect(r.entries.map((e) => e.name).sort()).toEqual(["q2", "q3"]);
  });
});
