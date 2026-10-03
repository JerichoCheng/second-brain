import type { QueryContext } from "./types.js";

export const DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/;

/** 本地日期 YYYY-MM-DD。不能用 toISOString：那是 UTC，珀斯早上 8 点前会得到昨天。 */
export function localDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function parseDay(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(y!, m! - 1, d!);
}

export function addDays(day: string, n: number): string {
  const d = parseDay(day);
  d.setDate(d.getDate() + n);
  return localDate(d);
}

export function today(ctx: QueryContext): string {
  return ctx.today ?? localDate(ctx.now ?? new Date());
}

/** today / tomorrow / yesterday → 具体日期；其他值原样返回。 */
export function resolveDate(value: unknown, ctx: QueryContext): string | null {
  if (typeof value !== "string") return null;
  const t = today(ctx);
  switch (value) {
    case "today":
      return t;
    case "tomorrow":
      return addDays(t, 1);
    case "yesterday":
      return addDays(t, -1);
  }
  return DATE_RE.test(value) ? value : null;
}

export const RANGES = [
  "this_week",
  "next_week",
  "last_7_days",
  "next_7_days",
  "this_month",
  "this_quarter",
  "this_year",
] as const;
export type RangeName = (typeof RANGES)[number];

/** 返回闭区间 [start, end]（YYYY-MM-DD）。 */
export function rangeOf(name: string, ctx: QueryContext): [string, string] | null {
  const t = today(ctx);
  const d = parseDay(t);
  const weekStart = ctx.weekStart ?? 1;
  switch (name) {
    case "this_week":
    case "next_week": {
      const offset = (d.getDay() - weekStart + 7) % 7;
      const start = addDays(t, -offset + (name === "next_week" ? 7 : 0));
      return [start, addDays(start, 6)];
    }
    case "last_7_days":
      return [addDays(t, -6), t];
    case "next_7_days":
      return [t, addDays(t, 6)];
    case "this_month": {
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      return [localDate(start), localDate(end)];
    }
    case "this_quarter": {
      const q = Math.floor(d.getMonth() / 3) * 3;
      return [localDate(new Date(d.getFullYear(), q, 1)), localDate(new Date(d.getFullYear(), q + 3, 0))];
    }
    case "this_year":
      return [`${d.getFullYear()}-01-01`, `${d.getFullYear()}-12-31`];
  }
  return null;
}

/** 日期部分（去掉时间）。 */
export function day(s: string): string {
  return s.slice(0, 10);
}
