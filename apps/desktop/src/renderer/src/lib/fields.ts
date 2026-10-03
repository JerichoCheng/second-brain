import type { ComputedDef, FieldDef, Schema, Value, ViewDef } from '@shared/db'
import { addDays, today } from './dates'

/**
 * 按 schema 解释字段：显示名、种类、能否编辑、选项颜色、视图显示哪些属性。
 * 界面只认字段类型，不认具体是哪个数据库。
 */

export type FieldKind =
  | FieldDef['type']
  | 'title'
  | 'mtime'
  /** 计算字段：逾期（布尔） */
  | 'overdue'
  /** 计算字段：进度（0–1） */
  | 'progress'
  /** 计算字段：数量 */
  | 'count'

export interface FieldInfo {
  key: string
  label: string
  kind: FieldKind
  /** 普通字段的定义；内置字段和计算字段没有 */
  def?: FieldDef
  computed?: ComputedDef
  /** 能否在界面上直接改（标题通过重命名修改，也算可编辑） */
  editable: boolean
}

const BUILTIN: Record<string, FieldInfo> = {
  name: { key: 'name', label: '名称', kind: 'title', editable: true },
  mtime: { key: 'mtime', label: '修改时间', kind: 'mtime', editable: false }
}

export function fieldInfo(schema: Schema, key: string): FieldInfo | null {
  if (BUILTIN[key]) return BUILTIN[key]
  const def = schema.fields[key]
  if (def) return { key, label: def.label ?? key, kind: def.type, def, editable: true }
  const c = schema.computed[key]
  if (c) return { key, label: c.label ?? key, kind: c.fn, computed: c, editable: false }
  for (const [k, f] of Object.entries(schema.fields)) {
    if (rangeStart(f) === key) {
      return { key, label: `${f.label ?? k}（开始）`, kind: 'date', def: { type: 'date' }, editable: true }
    }
  }
  return null
}

/** 名称、全部普通字段、计算字段、修改时间 */
export function allFields(schema: Schema): FieldInfo[] {
  return ['name', ...Object.keys(schema.fields), ...Object.keys(schema.computed), 'mtime']
    .map((k) => fieldInfo(schema, k))
    .filter((f): f is FieldInfo => f !== null)
}

/** 日期区间的开始字段名 */
export function rangeStart(def: FieldDef | undefined): string | null {
  if (!def || def.type !== 'date' || !def.range) return null
  return def.range === true ? 'start' : def.range
}

export interface StatusInfo {
  field: string
  def: FieldDef
  done: string[]
  /** 取消完成时改回的值 */
  undone: string
}

/** 数据库的 status 字段（只取第一个） */
export function statusInfo(schema: Schema): StatusInfo | null {
  const found = Object.entries(schema.fields).find(([, f]) => f.type === 'status')
  if (!found) return null
  const [field, def] = found
  const done = def.complete ?? ['done']
  const notDone = (def.options ?? []).filter((o) => !done.includes(o))
  const undone = typeof def.default === 'string' && !done.includes(def.default) ? def.default : (notDone[0] ?? '')
  return { field, def, done, undone }
}

/** 把要写入的 patch 换算成界面上的值，用于乐观更新（主进程推来变化后会以文件为准） */
export function patchToValues(schema: Schema, patch: Record<string, unknown>): Record<string, Value> {
  const out: Record<string, Value> = {}
  for (const [k, v] of Object.entries(patch)) {
    const kind = fieldInfo(schema, k)?.kind
    const list = kind === 'multi_select' || kind === 'relation'
    if (v === undefined || v === null || v === '') {
      out[k] = kind === 'checkbox' ? false : list ? [] : null
    } else if (list) {
      const arr = Array.isArray(v) ? v : [v]
      out[k] = arr.map((s) => String(s).replace(/^\[\[|\]\]$/g, ''))
    } else if (kind === 'date' && (v === 'today' || v === 'tomorrow' || v === 'yesterday')) {
      out[k] = addDays(today(), v === 'today' ? 0 : v === 'tomorrow' ? 1 : -1)
    } else {
      out[k] = v as Value
    }
  }
  return out
}

// ---------------------------------------------------------------- 选项颜色

export type TagColor = 'gray' | 'blue' | 'yellow' | 'orange' | 'purple' | 'pink' | 'brown' | 'red' | 'green'

const PALETTE: TagColor[] = ['gray', 'blue', 'yellow', 'orange', 'purple', 'pink', 'brown', 'red', 'green']

function hash(s: string): number {
  let h = 0
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0
  return Math.abs(h)
}

/** 选项按在 options 中的位置轮流取色；status 的完成值总是绿色；自由填写的选项按文字取色 */
export function tagColor(def: FieldDef | undefined, option: string): TagColor {
  if (def?.type === 'status' && (def.complete ?? ['done']).includes(option)) return 'green'
  const i = def?.options?.indexOf(option) ?? -1
  if (i >= 0) return PALETTE[i % (PALETTE.length - 1)]!
  return PALETTE[hash(option) % PALETTE.length]!
}

// ---------------------------------------------------------------- 视图显示的属性

/** 卡片和列表默认显示的属性：前几个选项、日期、关联字段 */
function defaultCardColumns(schema: Schema, view: ViewDef): string[] {
  const wanted = new Set(['status', 'select', 'multi_select', 'date', 'relation'])
  return Object.entries(schema.fields)
    .filter(([k, f]) => wanted.has(f.type) && k !== view.group && k !== view.date)
    .slice(0, 4)
    .map(([k]) => k)
}

/**
 * 视图显示的属性（不含标题以外的内置列时也一样处理）：
 * columns 指定了就按它，否则表格显示全部字段、其他视图显示几个常用字段；再去掉 hide 里的。
 * 看板的 hide 指隐藏的分组，不影响属性。
 */
export function visibleColumns(schema: Schema, view: ViewDef): string[] {
  const base =
    view.columns ??
    (view.type === 'table'
      ? ['name', ...Object.keys(schema.fields), ...Object.keys(schema.computed)]
      : defaultCardColumns(schema, view))
  const hidden = new Set(view.type === 'board' ? [] : (view.hide ?? []))
  const cols = base.filter((k) => !hidden.has(k) && fieldInfo(schema, k) !== null)
  // 表格总是显示标题列，并放在最前
  if (view.type === 'table') return ['name', ...cols.filter((k) => k !== 'name')]
  return cols.filter((k) => k !== 'name')
}

/** 显示或隐藏一个属性：写成明确的 columns，同时从 hide 中去掉 */
export function toggleColumn(schema: Schema, view: ViewDef, key: string): ViewDef {
  const current = visibleColumns(schema, view)
  const columns = current.includes(key) ? current.filter((k) => k !== key) : [...current, key]
  const hide = view.type === 'board' ? view.hide : view.hide?.filter((k) => k !== key)
  return { ...view, columns, hide: hide?.length ? hide : undefined }
}
