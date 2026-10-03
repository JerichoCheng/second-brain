import type { Condition, FilterItem, FilterOp, Schema, Value, ViewDef, ViewType } from '@shared/db'
import { addDays, parseDay, today } from './dates'
import { fieldInfo, type FieldKind } from './fields'

// ---------------------------------------------------------------- 新建条目的默认值

/** 新建时所在的位置：看板的列、表格/列表的分组、日历的某一天 */
export interface CreateContext {
  group?: { field: string; key: string | null }
  date?: { field: string; day: string }
}

/** 能从「是」条件推出的值 */
function valueFromCondition(schema: Schema, cond: Condition): [string, unknown] | null {
  const [field, op, raw] = cond
  const info = fieldInfo(schema, field)
  if (!info?.def || raw === '$this') return null
  const value = Array.isArray(raw) ? (raw.length === 1 ? raw[0] : undefined) : raw
  if (value === undefined || value === null) return null
  const multi = info.kind === 'multi_select' || (info.kind === 'relation' && info.def.multiple)
  if (op === 'is') {
    if (info.kind === 'checkbox') return [field, value === true || value === 'true']
    return [field, multi ? [String(value)] : value]
  }
  if (op === 'contains' && (info.kind === 'multi_select' || info.kind === 'relation')) {
    return [field, multi ? [String(value)] : String(value)]
  }
  if (info.kind === 'date') {
    // 「不晚于今天」「本周内」之类：取一个满足条件的日期
    if (op === 'on_or_before' || op === 'on_or_after') return [field, value]
    if (op === 'within') return [field, value === 'next_week' ? nextWeekStart() : 'today']
  }
  return null
}

function nextWeekStart(): string {
  const t = today()
  const offset = (parseDay(t).getDay() + 6) % 7
  return addDays(t, 7 - offset)
}

/**
 * 按当前视图推出新条目的字段值，让新条目留在当前视图里：
 * - 顶层的「是 / 包含」条件直接采用（如 Inbox 视图的 status = inbox）
 * - `any` 组里如果还没有条件被满足，取第一个能采用的（如 Today 视图会勾上 My Day）
 * - 所在分组和日期（看板的列、日历的某天）最后覆盖
 */
export function defaultsFromView(schema: Schema, view: ViewDef, ctx: CreateContext = {}): Record<string, unknown> {
  const out: Record<string, unknown> = {}

  const visit = (items: FilterItem[]): void => {
    for (const item of items) {
      if (Array.isArray(item)) {
        const pair = valueFromCondition(schema, item)
        if (pair && !(pair[0] in out)) out[pair[0]] = pair[1]
      } else if ('all' in item) {
        visit(item.all)
      } else if ('any' in item) {
        const simple = item.any.filter((i): i is Condition => Array.isArray(i))
        // 已经设了值的字段，或者新条目留空就满足的条件（为空、不是、不包含）
        const satisfied = simple.some(
          ([f, op]) => f in out || op === 'is_empty' || op === 'is_not' || op === 'not_contains'
        )
        if (!satisfied) {
          for (const c of simple) {
            const pair = valueFromCondition(schema, c)
            if (pair) {
              out[pair[0]] = pair[1]
              break
            }
          }
        }
      }
    }
  }
  visit(view.filter ?? [])

  if (ctx.group) {
    const info = fieldInfo(schema, ctx.group.field)
    if (info?.def) {
      const { key } = ctx.group
      const multi = info.kind === 'multi_select' || (info.kind === 'relation' && info.def.multiple)
      if (key === null) delete out[ctx.group.field]
      else if (info.kind === 'checkbox') out[ctx.group.field] = key === 'true'
      else out[ctx.group.field] = multi ? [key] : key
    }
  }
  if (ctx.date) out[ctx.date.field] = ctx.date.day
  return out
}

// ---------------------------------------------------------------- 过滤

export const OP_LABELS: Record<FilterOp, string> = {
  is: '是',
  is_not: '不是',
  contains: '包含',
  not_contains: '不包含',
  is_empty: '为空',
  is_not_empty: '不为空',
  before: '早于',
  after: '晚于',
  on_or_before: '不晚于',
  on_or_after: '不早于',
  within: '在范围内'
}

const NUMBER_OP_LABELS: Partial<Record<FilterOp, string>> = {
  is: '=',
  is_not: '≠',
  before: '<',
  after: '>',
  on_or_before: '≤',
  on_or_after: '≥'
}

export function opLabel(kind: FieldKind, op: FilterOp): string {
  if (kind === 'number' || kind === 'count' || kind === 'progress') return NUMBER_OP_LABELS[op] ?? OP_LABELS[op]
  return OP_LABELS[op]
}

const EMPTY_OPS: FilterOp[] = ['is_empty', 'is_not_empty']

export function opsFor(kind: FieldKind): FilterOp[] {
  switch (kind) {
    case 'title':
    case 'text':
    case 'url':
    case 'recurrence':
      return ['contains', 'not_contains', 'is', 'is_not', ...EMPTY_OPS]
    case 'number':
    case 'count':
    case 'progress':
      return ['is', 'is_not', 'before', 'after', 'on_or_before', 'on_or_after', ...EMPTY_OPS]
    case 'checkbox':
    case 'overdue':
      return ['is']
    case 'select':
    case 'status':
      return ['is', 'is_not', ...EMPTY_OPS]
    case 'multi_select':
    case 'relation':
      return ['contains', 'not_contains', ...EMPTY_OPS]
    case 'date':
      return ['is', 'before', 'after', 'on_or_before', 'on_or_after', 'within', ...EMPTY_OPS]
    case 'mtime':
      return []
  }
}

export function needsValue(op: FilterOp): boolean {
  return !EMPTY_OPS.includes(op)
}

/** 给新条件或换了操作符的条件一个合适的初始值 */
export function initialValue(schema: Schema, field: string, op: FilterOp): unknown {
  const info = fieldInfo(schema, field)
  if (!info || !needsValue(op)) return undefined
  if (op === 'within') return 'this_week'
  switch (info.kind) {
    case 'checkbox':
    case 'overdue':
      return true
    case 'date':
      return 'today'
    case 'select':
    case 'status':
    case 'multi_select':
      return info.def?.options?.[0] ?? ''
    case 'number':
    case 'count':
      return 0
    case 'progress':
      return 1
    default:
      return ''
  }
}

export const RANGE_LABELS: Record<string, string> = {
  this_week: '本周',
  next_week: '下周',
  last_7_days: '过去 7 天',
  next_7_days: '未来 7 天',
  this_month: '本月',
  this_quarter: '本季度',
  this_year: '今年'
}

export const DATE_KEYWORDS: Record<string, string> = {
  today: '今天',
  tomorrow: '明天',
  yesterday: '昨天'
}

export function countConditions(items: FilterItem[] = []): number {
  return items.reduce((n, i) => n + (Array.isArray(i) ? 1 : countConditions('any' in i ? i.any : i.all)), 0)
}

// ---------------------------------------------------------------- 视图

export const VIEW_TYPE_LABELS: Record<ViewType, string> = {
  table: '表格',
  board: '看板',
  calendar: '日历',
  list: '列表',
  gallery: '画廊'
}

/** 去掉空值后的规范形式，用来判断视图有没有被临时修改 */
function canonical(view: ViewDef): string {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(view).sort(([a], [b]) => a.localeCompare(b))) {
    if (v === undefined || v === null || v === '' || v === false) continue
    if (Array.isArray(v) && v.length === 0) continue
    out[k] = v
  }
  return JSON.stringify(out)
}

export function sameView(a: ViewDef, b: ViewDef): boolean {
  return canonical(a) === canonical(b)
}

/** 新建视图时的默认设置：看板按第一个 status/select 字段分组，日历用第一个日期字段 */
export function newView(schema: Schema, type: ViewType, name: string): ViewDef {
  const view: ViewDef = { name, type }
  const fields = Object.entries(schema.fields)
  if (type === 'board') {
    const g = fields.find(([, f]) => f.type === 'status') ?? fields.find(([, f]) => f.type === 'select')
    if (g) view.group = g[0]
  }
  if (type === 'calendar') {
    const d = fields.find(([, f]) => f.type === 'date')
    if (d) view.date = d[0]
  }
  return view
}

/** 不和已有视图重名的名字：表格、表格 2、表格 3…… */
export function uniqueViewName(schema: Schema, base: string): string {
  const taken = new Set(schema.views.map((v) => v.name))
  if (!taken.has(base)) return base
  for (let i = 2; ; i++) if (!taken.has(`${base} ${i}`)) return `${base} ${i}`
}

/** 视图能不能用：看板要有 select/status 分组，日历要有日期字段 */
export function viewProblem(schema: Schema, view: ViewDef): string | null {
  if (view.type === 'board') {
    const t = view.group ? schema.fields[view.group]?.type : undefined
    if (t !== 'select' && t !== 'status') return '看板需要按「选项」或「状态」字段分组，在「分组」里选一个'
  }
  if (view.type === 'calendar' && schema.fields[view.date ?? '']?.type !== 'date') {
    return '日历需要一个日期字段，在视图设置里选一个'
  }
  return null
}

/** 值是否为空（和 vault-core 的判断一致：checkbox 未勾选算空） */
export function isEmptyValue(v: Value | undefined): boolean {
  return v === undefined || v === null || v === '' || v === false || (Array.isArray(v) && v.length === 0)
}
