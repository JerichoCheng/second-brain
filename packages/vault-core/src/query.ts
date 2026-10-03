import { DATE_RE, day, rangeOf, resolveDate, today } from "./dates.js";
import { nameKey, relationTargets } from "./links.js";
import { completeValues, rangeStartField, statusField } from "./schema.js";
import type { Entry, FieldDef, FilterItem, Group, QueryContext, QueryResult, Schema, ViewDef } from "./types.js";

/** 查询引擎需要的索引能力，由 Vault 实现。 */
export interface IndexLike {
  schemas: Map<string, Schema>;
  entriesOf(db: string): Entry[];
  /** db 中通过字段 via 关联到 name 的条目。 */
  referrers(name: string, db: string, via: string): Entry[];
  /** 按名字找条目（不区分大小写）。 */
  resolve(name: string): Entry | undefined;
}

export type Value = string | number | boolean | string[] | null;

// ---------------------------------------------------------------- 取值

function asString(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return null;
}

/** 把原始 frontmatter 值按字段类型规整。 */
export function normalize(def: FieldDef | undefined, raw: unknown): Value {
  if (!def) return raw == null ? null : (raw as Value);
  switch (def.type) {
    case "number": {
      const n = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() ? Number(raw) : NaN;
      return Number.isFinite(n) ? n : null;
    }
    case "checkbox":
      return raw === true || raw === "true" || raw === "yes";
    case "multi_select":
      if (Array.isArray(raw)) return raw.map(asString).filter((x): x is string => x !== null);
      return asString(raw) ? [asString(raw)!] : [];
    case "relation":
      return relationTargets(raw);
    case "date": {
      const s = asString(raw);
      return s && DATE_RE.test(s) ? s : null;
    }
    default:
      return asString(raw);
  }
}

function fieldDef(schema: Schema, field: string): FieldDef | undefined {
  const def = schema.fields[field];
  if (def) return def;
  for (const f of Object.values(schema.fields)) {
    if (rangeStartField(f) === field) return { type: "date" };
  }
  return undefined;
}

export function isComplete(schema: Schema, entry: Entry): boolean {
  const sf = statusField(schema);
  if (!sf) return false;
  const v = normalize(sf[1], entry.data[sf[0]]);
  return typeof v === "string" && completeValues(sf[1]).includes(v);
}

export function getValue(idx: IndexLike, schema: Schema, entry: Entry, field: string, ctx: QueryContext): Value {
  if (field === "name") return entry.name;
  if (field === "mtime") return entry.mtimeMs;
  const c = schema.computed[field];
  if (c) {
    if (c.fn === "overdue") {
      const due = normalize({ type: "date" }, entry.data[c.field]) as string | null;
      if (!due || isComplete(schema, entry)) return false;
      if (due.length > 10) return new Date(due).getTime() < (ctx.now ?? new Date()).getTime();
      return due < today(ctx);
    }
    const from = idx.schemas.get(c.from);
    if (!from) return null;
    const refs = idx.referrers(entry.name, c.from, c.via);
    if (c.fn === "count") return refs.length;
    if (!refs.length) return null;
    return refs.filter((e) => isComplete(from, e)).length / refs.length;
  }
  return normalize(fieldDef(schema, field), entry.data[field]);
}

// ---------------------------------------------------------------- 过滤

function filterValue(v: unknown, ctx: QueryContext): unknown {
  if (v === "$this") return ctx.self ?? null;
  if (typeof v === "string") {
    const links = relationTargets(v);
    if (v.startsWith("[[") && links.length === 1) return links[0];
  }
  return v;
}

function isEmpty(v: Value): boolean {
  return v === null || v === "" || v === false || (Array.isArray(v) && v.length === 0);
}

function eq(def: FieldDef | undefined, actual: Value, expected: unknown, ctx: QueryContext): boolean {
  if (expected === null || expected === undefined) return isEmpty(actual);
  if (Array.isArray(actual)) {
    const key = def?.type === "relation" ? nameKey : (s: string) => s;
    return actual.some((a) => key(a) === key(String(expected)));
  }
  if (typeof actual === "boolean") return actual === (expected === true || expected === "true");
  if (def?.type === "date") {
    const d = resolveDate(expected, ctx);
    return actual !== null && d !== null && day(String(actual)) === day(d);
  }
  if (typeof actual === "number") return actual === Number(expected);
  return actual === String(expected);
}

function compare(def: FieldDef | undefined, actual: Value, expected: unknown, ctx: QueryContext): number | null {
  if (actual === null || Array.isArray(actual)) return null;
  if (def?.type === "date" || (typeof actual === "string" && DATE_RE.test(actual))) {
    const d = resolveDate(expected, ctx);
    if (d === null) return null;
    const a = day(String(actual));
    const b = day(d);
    return a < b ? -1 : a > b ? 1 : 0;
  }
  const a = Number(actual);
  const b = Number(expected);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return a - b;
}

function test(
  idx: IndexLike, schema: Schema, entry: Entry, item: FilterItem, ctx: QueryContext,
): boolean {
  if (!Array.isArray(item)) {
    if ("any" in item) return item.any.some((i) => test(idx, schema, entry, i, ctx));
    return item.all.every((i) => test(idx, schema, entry, i, ctx));
  }
  const [field, op, rawValue] = item;
  const def = fieldDef(schema, field);
  const actual = getValue(idx, schema, entry, field, ctx);
  const value = Array.isArray(rawValue) ? rawValue.map((v) => filterValue(v, ctx)) : filterValue(rawValue, ctx);
  const anyEq = () => (Array.isArray(value) ? value.some((v) => eq(def, actual, v, ctx)) : eq(def, actual, value, ctx));
  const cmp = () => compare(def, actual, value, ctx);
  switch (op) {
    case "is":
      return anyEq();
    case "is_not":
      return !anyEq();
    case "contains":
    case "not_contains": {
      let hit: boolean;
      if (Array.isArray(actual)) hit = anyEq();
      else hit = typeof actual === "string" && actual.toLowerCase().includes(String(value).toLowerCase());
      return op === "contains" ? hit : !hit;
    }
    case "is_empty":
      return isEmpty(actual);
    case "is_not_empty":
      return !isEmpty(actual);
    case "before": { const c = cmp(); return c !== null && c < 0; }
    case "after": { const c = cmp(); return c !== null && c > 0; }
    case "on_or_before": { const c = cmp(); return c !== null && c <= 0; }
    case "on_or_after": { const c = cmp(); return c !== null && c >= 0; }
    case "within": {
      const r = rangeOf(String(value), ctx);
      if (!r || typeof actual !== "string" || !DATE_RE.test(actual)) return false;
      const d = day(actual);
      return d >= r[0] && d <= r[1];
    }
  }
  return false;
}

export function matches(idx: IndexLike, schema: Schema, entry: Entry, filter: FilterItem[], ctx: QueryContext): boolean {
  return filter.every((item) => test(idx, schema, entry, item, ctx));
}

function mentions(filter: FilterItem[], field: string): boolean {
  return filter.some((i) => (Array.isArray(i) ? i[0] === field : mentions("any" in i ? i.any : i.all, field)));
}

// ---------------------------------------------------------------- 排序与分组

const collator = new Intl.Collator(["zh-Hans-CN", "en"], { numeric: true, sensitivity: "base" });

/** 用于排序的键：select/status 按 options 顺序，其余按值本身。 */
function sortKey(def: FieldDef | undefined, v: Value): string | number | null {
  if (isEmpty(v) && v !== false) return null;
  if (Array.isArray(v)) v = v[0] ?? null;
  if (v === null) return null;
  if (def && (def.type === "select" || def.type === "status") && def.options?.length) {
    const i = def.options.indexOf(String(v));
    return i === -1 ? def.options.length : i;
  }
  if (typeof v === "boolean") return v ? 0 : 1;
  return v;
}

function cmpKeys(a: string | number | null, b: string | number | null): number {
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1; // 空值总在最后
  if (typeof a === "number" && typeof b === "number") return a - b;
  return collator.compare(String(a), String(b));
}

function sortEntries(idx: IndexLike, schema: Schema, entries: Entry[], sort: string[], ctx: QueryContext) {
  const specs = sort.map((s) => ({ field: s.replace(/^-/, ""), desc: s.startsWith("-") }));
  const keyed = entries.map((e) => ({
    e,
    keys: specs.map((s) => sortKey(fieldDef(schema, s.field), getValue(idx, schema, e, s.field, ctx))),
  }));
  keyed.sort((x, y) => {
    for (let i = 0; i < specs.length; i++) {
      const a = x.keys[i]!;
      const b = y.keys[i]!;
      if (a === null || b === null) {
        const c = cmpKeys(a, b);
        if (c) return c;
        continue;
      }
      const c = cmpKeys(a, b);
      if (c) return specs[i]!.desc ? -c : c;
    }
    return collator.compare(x.e.name, y.e.name);
  });
  return keyed.map((k) => k.e);
}

function groupKeys(def: FieldDef | undefined, v: Value): (string | null)[] {
  if (Array.isArray(v)) return v.length ? v : [null];
  if (v === null || v === "") return [null];
  if (def?.type === "date") return [day(String(v))];
  return [String(v)];
}

function groupEntries(
  idx: IndexLike, schema: Schema, entries: Entry[], view: ViewDef, ctx: QueryContext,
): Group[] {
  const field = view.group!;
  const def = fieldDef(schema, field);
  const map = new Map<string | null, Entry[]>();
  const isBoard = view.type === "board";
  if (isBoard) for (const o of def?.options ?? []) map.set(o, []);
  for (const e of entries) {
    for (const k of groupKeys(def, getValue(idx, schema, e, field, ctx))) {
      const key = k !== null && def?.type === "relation" ? relationName(idx, k) : k;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
  }
  const hidden = new Set(isBoard ? view.hide ?? [] : []);
  const order = (k: string | null) => sortKey(def, k);
  return [...map.entries()]
    .filter(([k]) => k === null || !hidden.has(k))
    .sort(([a], [b]) => cmpKeys(order(a), order(b)))
    .map(([key, list]) => ({ key, entries: list }));
}

/** 关联分组时，用目标页面的实际名字（大小写以文件名为准）合并分组。 */
function relationName(idx: IndexLike, name: string): string {
  return idx.resolve(name)?.name ?? name;
}

// ---------------------------------------------------------------- 入口

export function runQuery(
  idx: IndexLike, schema: Schema, view: ViewDef, ctx: QueryContext = {},
): QueryResult {
  const filter = view.filter ?? [];
  const hideArchived = schema.fields.archived?.type === "checkbox" && !view.include_archived && !mentions(filter, "archived");
  let entries = idx
    .entriesOf(schema.id)
    .filter((e) => !(hideArchived && e.data.archived === true))
    .filter((e) => matches(idx, schema, e, filter, ctx));
  entries = sortEntries(idx, schema, entries, view.sort ?? [], ctx);
  if (!view.group) return { entries };
  const groups = groupEntries(idx, schema, entries, view, ctx);
  if (view.type === "board" && view.hide?.length) {
    const shown = new Set(groups.flatMap((g) => g.entries));
    entries = entries.filter((e) => shown.has(e));
  }
  return { entries, groups };
}
