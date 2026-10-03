import { promises as fs } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { RANGES } from "./dates.js";
import type { ComputedDef, FieldDef, FieldType, FilterItem, Schema, ViewDef } from "./types.js";

const FIELD_TYPES: FieldType[] = [
  "text", "number", "checkbox", "select", "multi_select", "status", "date", "relation", "url", "recurrence",
];
const VIEW_TYPES = ["table", "list", "board", "calendar", "gallery"];
const OPS = [
  "is", "is_not", "contains", "not_contains", "is_empty", "is_not_empty",
  "before", "after", "on_or_before", "on_or_after", "within",
];
/** 每个条目都有的内置字段，可用于过滤和排序。 */
export const BUILTIN_FIELDS = ["name", "mtime"];

export class SchemaError extends Error {}

/** 字段的区间开始字段名（date 且 range 开启时）。 */
export function rangeStartField(def: FieldDef): string | null {
  if (def.type !== "date" || !def.range) return null;
  return def.range === true ? "start" : def.range;
}

/** status 字段中算「完成」的值。 */
export function completeValues(def: FieldDef): string[] {
  return def.complete ?? ["done"];
}

/** 数据库的 status 字段（只取第一个）。 */
export function statusField(schema: Schema): [string, FieldDef] | null {
  return Object.entries(schema.fields).find(([, f]) => f.type === "status") ?? null;
}

export function parseSchema(id: string, text: string): Schema {
  const raw = parse(text, { version: "1.2" }) as Record<string, unknown> | null;
  if (!raw || typeof raw !== "object") throw new SchemaError(`${id}: 文件为空或格式不对`);
  const s: Schema = {
    id,
    name: String(raw.name ?? id),
    folder: String(raw.folder ?? id).replace(/\\/g, "/").replace(/^\/+|\/+$/g, ""),
    icon: raw.icon as string | undefined,
    template: raw.template as string | undefined,
    fields: (raw.fields ?? {}) as Record<string, FieldDef>,
    computed: (raw.computed ?? {}) as Record<string, ComputedDef>,
    views: (raw.views ?? []) as ViewDef[],
  };
  for (const f of Object.values(s.fields)) {
    if (f && (f.type === "select" || f.type === "multi_select" || f.type === "status")) {
      f.options = (f.options ?? []).map(String);
    }
  }
  return s;
}

export async function loadSchemas(dir: string): Promise<Map<string, Schema>> {
  const out = new Map<string, Schema>();
  let files: string[];
  try {
    files = await fs.readdir(dir);
  } catch {
    return out;
  }
  for (const f of files.sort()) {
    if (!/\.ya?ml$/.test(f)) continue;
    const id = f.replace(/\.ya?ml$/, "");
    out.set(id, parseSchema(id, await fs.readFile(path.join(dir, f), "utf8")));
  }
  return out;
}

/** 检查所有 schema 是否自洽，返回问题列表（空表示没问题）。 */
export function validateSchemas(schemas: Map<string, Schema>): string[] {
  const errors: string[] = [];
  const folders = new Map<string, string>();
  for (const s of schemas.values()) {
    const err = (msg: string) => errors.push(`${s.id}: ${msg}`);
    if (folders.has(s.folder)) err(`folder "${s.folder}" 与 ${folders.get(s.folder)} 重复`);
    folders.set(s.folder, s.id);

    const startFields = new Set<string>();
    for (const [name, f] of Object.entries(s.fields)) {
      if (!f || !FIELD_TYPES.includes(f.type)) {
        err(`字段 ${name} 的类型 "${f?.type}" 无效`);
        continue;
      }
      if (BUILTIN_FIELDS.includes(name)) err(`字段名 ${name} 是内置字段`);
      if (f.type === "relation") {
        if (!f.to) err(`关联字段 ${name} 缺少 to`);
        else if (!schemas.has(f.to)) err(`关联字段 ${name} 指向不存在的数据库 ${f.to}`);
      }
      if (f.type === "status") {
        for (const c of completeValues(f)) {
          if (f.options!.length && !f.options!.includes(c)) err(`status 字段 ${name} 的 complete 值 ${c} 不在 options 中`);
        }
      }
      const start = rangeStartField(f);
      if (start) {
        if (s.fields[start]) err(`日期区间 ${name} 的开始字段 ${start} 与已有字段重名`);
        startFields.add(start);
      }
      if (f.default !== undefined && f.options?.length) {
        const vals = Array.isArray(f.default) ? f.default : [f.default];
        for (const v of vals) if (!f.options.includes(String(v))) err(`字段 ${name} 的默认值 ${v} 不在 options 中`);
      }
    }

    for (const [name, c] of Object.entries(s.computed)) {
      if (s.fields[name]) err(`计算字段 ${name} 与普通字段重名`);
      if (c.fn === "overdue") {
        if (s.fields[c.field]?.type !== "date") err(`计算字段 ${name}: ${c.field} 不是日期字段`);
        if (!statusField(s)) err(`计算字段 ${name}: overdue 需要数据库有 status 字段`);
      } else if (c.fn === "progress" || c.fn === "count") {
        const from = schemas.get(c.from);
        if (!from) err(`计算字段 ${name}: 数据库 ${c.from} 不存在`);
        else {
          const via = from.fields[c.via];
          if (via?.type !== "relation" || via.to !== s.id) err(`计算字段 ${name}: ${c.from}.${c.via} 不是指向 ${s.id} 的关联`);
          if (c.fn === "progress" && !statusField(from)) err(`计算字段 ${name}: ${c.from} 没有 status 字段`);
        }
      } else {
        err(`计算字段 ${name} 的函数 "${(c as { fn: string }).fn}" 不支持`);
      }
    }

    const known = new Set([...Object.keys(s.fields), ...Object.keys(s.computed), ...startFields, ...BUILTIN_FIELDS]);
    const names = new Set<string>();
    for (const v of s.views) {
      const ve = (msg: string) => err(`视图「${v.name}」${msg}`);
      if (names.has(v.name)) ve("重名");
      names.add(v.name);
      if (!VIEW_TYPES.includes(v.type)) ve(`类型 "${v.type}" 无效`);
      checkFilter(v.filter ?? [], known, ve);
      for (const k of v.sort ?? []) if (!known.has(k.replace(/^-/, ""))) ve(`排序字段 ${k} 不存在`);
      if (v.group && !known.has(v.group)) ve(`分组字段 ${v.group} 不存在`);
      for (const k of v.columns ?? []) if (!known.has(k)) ve(`列 ${k} 不存在`);
      if (v.type === "board") {
        const g = v.group ? s.fields[v.group] : undefined;
        if (!g || (g.type !== "select" && g.type !== "status")) ve("看板必须按 select 或 status 字段分组");
      }
      if (v.type === "calendar") {
        if (!v.date || s.fields[v.date]?.type !== "date") ve("日历视图需要 date 指向日期字段");
      }
    }
  }
  return errors;
}

function checkFilter(items: FilterItem[], known: Set<string>, err: (m: string) => void) {
  for (const item of items) {
    if (Array.isArray(item)) {
      const [field, op, value] = item;
      if (!known.has(field)) err(`过滤字段 ${field} 不存在`);
      if (!OPS.includes(op)) err(`过滤操作符 ${op} 无效`);
      if (op === "within" && !(RANGES as readonly string[]).includes(String(value))) err(`within 的值 ${value} 无效`);
    } else if ("any" in item) checkFilter(item.any, known, err);
    else if ("all" in item) checkFilter(item.all, known, err);
    else err("过滤条件格式无效");
  }
}
