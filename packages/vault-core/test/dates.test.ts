import { describe, expect, it } from "vitest";
import { addDays, localDate, rangeOf, resolveDate } from "../src/dates.js";

describe("日期", () => {
  it("今天按本地时区算（珀斯早上 7:30，UTC 还是前一天）", () => {
    const d = new Date("2026-10-03T23:30:00Z"); // 珀斯 10 月 4 日 07:30
    expect(localDate(d)).toBe("2026-10-04");
    expect(d.toISOString().slice(0, 10)).toBe("2026-10-03");
  });

  it("相对日期", () => {
    const ctx = { today: "2026-10-03" };
    expect(resolveDate("today", ctx)).toBe("2026-10-03");
    expect(resolveDate("tomorrow", ctx)).toBe("2026-10-04");
    expect(resolveDate("yesterday", ctx)).toBe("2026-10-02");
    expect(resolveDate("2026-01-01", ctx)).toBe("2026-01-01");
    expect(resolveDate("下周", ctx)).toBeNull();
  });

  it("跨月、跨年加减", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
  });

  it("本周默认从周一开始", () => {
    // 2026-10-03 是周六
    expect(rangeOf("this_week", { today: "2026-10-03" })).toEqual(["2026-09-28", "2026-10-04"]);
    expect(rangeOf("this_week", { today: "2026-10-03", weekStart: 0 })).toEqual(["2026-09-27", "2026-10-03"]);
    expect(rangeOf("next_week", { today: "2026-10-03" })).toEqual(["2026-10-05", "2026-10-11"]);
    // 周一当天
    expect(rangeOf("this_week", { today: "2026-09-28" })).toEqual(["2026-09-28", "2026-10-04"]);
  });

  it("月、季度、年、前后 7 天", () => {
    const ctx = { today: "2028-02-10" };
    expect(rangeOf("this_month", ctx)).toEqual(["2028-02-01", "2028-02-29"]);
    expect(rangeOf("this_quarter", { today: "2026-10-03" })).toEqual(["2026-10-01", "2026-12-31"]);
    expect(rangeOf("this_year", ctx)).toEqual(["2028-01-01", "2028-12-31"]);
    expect(rangeOf("next_7_days", { today: "2026-10-03" })).toEqual(["2026-10-03", "2026-10-09"]);
    expect(rangeOf("last_7_days", { today: "2026-10-03" })).toEqual(["2026-09-27", "2026-10-03"]);
  });
});
