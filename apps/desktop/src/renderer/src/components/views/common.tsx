import { useState } from 'react'
import {
  ArrowUpRight,
  Calendar,
  CircleCheck,
  CircleChevronDown,
  CircleDashed,
  Clock,
  Hash,
  Link,
  List,
  Plus,
  Repeat,
  Sigma,
  SquareCheck,
  Text,
  Type
} from 'lucide-react'
import type { QueryData, Row, Schema, Value, ViewDef } from '@shared/db'
import { CheckboxMark, OptionTag, PropertyValue, RelationChip } from '@/components/properties/PropertyValue'
import { BareInput } from '@/components/ui/input'
import { formatDate } from '@/lib/dates'
import { fieldInfo, statusInfo, type FieldKind } from '@/lib/fields'
import { cn } from '@/lib/utils'
import type { CreateContext } from '@/lib/view-logic'

/** 各种视图共用的参数 */
export interface ViewProps {
  schema: Schema
  view: ViewDef
  data: QueryData
  /** 要显示的属性（表格的列、卡片上的字段） */
  columns: string[]
  onPatch: (row: Row, patch: Record<string, unknown>) => void
  onRename: (row: Row, title: string) => void
  /** 打开页面面板；参数是路径或页面名 */
  onOpen: (pathOrName: string) => void
  onCreate: (title: string, ctx: CreateContext) => Promise<void>
  /** 临时修改视图（排序、隐藏列等） */
  onViewChange: (view: ViewDef) => void
  /** 自由填写的多选字段在当前结果中出现过的值 */
  suggestions: Record<string, string[]>
}

const ICONS: Record<FieldKind, typeof Type> = {
  title: Type,
  text: Text,
  number: Hash,
  checkbox: SquareCheck,
  select: CircleChevronDown,
  multi_select: List,
  status: CircleDashed,
  date: Calendar,
  relation: ArrowUpRight,
  url: Link,
  recurrence: Repeat,
  overdue: Sigma,
  progress: Sigma,
  count: Sigma,
  mtime: Clock
}

export function FieldIcon({ kind, className }: { kind: FieldKind; className?: string }) {
  const Icon = ICONS[kind]
  return <Icon className={cn('size-3.5 shrink-0 opacity-70', className)} />
}

/** 一组条目：有分组时每组一段，没有分组时只有一段（key 为 undefined） */
export interface Section {
  key: string | null | undefined
  rows: Row[]
}

export function sections(data: QueryData): Section[] {
  if (!data.groups) return [{ key: undefined, rows: data.rows }]
  const byPath = new Map(data.rows.map((r) => [r.path, r]))
  return data.groups.map((g) => ({
    key: g.key,
    rows: g.paths.map((p) => byPath.get(p)).filter((r): r is Row => r !== undefined)
  }))
}

/** 分组标题：选项显示成标签，关联显示成页面，日期显示成「明天」之类 */
export function GroupLabel({ schema, field, groupKey }: { schema: Schema; field: string; groupKey: string | null }) {
  const info = fieldInfo(schema, field)
  if (groupKey === null) return <span className="text-muted-foreground">无{info?.label ?? field}</span>
  switch (info?.kind) {
    case 'select':
    case 'status':
    case 'multi_select':
      return <OptionTag def={info.def} value={groupKey} />
    case 'relation':
      return <RelationChip name={groupKey} />
    case 'date':
      return <span className="font-medium">{formatDate(groupKey)}</span>
    case 'checkbox':
    case 'overdue':
      return (
        <span className="flex items-center gap-1.5">
          <CheckboxMark checked={groupKey === 'true'} />
          {info.label}
        </span>
      )
    default:
      return <span className="font-medium">{groupKey}</span>
  }
}

/** 列表和卡片左侧的完成勾选（数据库有 status 字段时） */
export function StatusToggle({ schema, row, onPatch }: Pick<ViewProps, 'schema' | 'onPatch'> & { row: Row }) {
  const status = statusInfo(schema)
  if (!status || row.error) return null
  const value = row.values[status.field]
  const done = typeof value === 'string' && status.done.includes(value)
  return (
    <button
      type="button"
      className={cn(
        'flex size-5 shrink-0 items-center justify-center rounded-full',
        done ? 'text-success' : 'text-muted-foreground/60 hover:text-foreground'
      )}
      onClick={(e) => {
        e.stopPropagation()
        onPatch(row, { [status.field]: done ? status.undone : status.done[0] })
      }}
      aria-label={done ? '标为未完成' : '标为完成'}
      aria-pressed={done}
    >
      {done ? <CircleCheck className="size-[18px]" /> : <span className="size-[15px] rounded-full border-[1.5px] border-current" />}
    </button>
  )
}

function nonEmpty(v: Value | undefined): boolean {
  return !(v === undefined || v === null || v === '' || v === false || (Array.isArray(v) && v.length === 0))
}

/** 卡片和列表行上的属性：只显示有值的 */
export function CardProperties({
  schema,
  row,
  columns,
  onOpen,
  className
}: Pick<ViewProps, 'schema' | 'columns' | 'onOpen'> & { row: Row; className?: string }) {
  const shown = columns.filter((k) => nonEmpty(row.values[k]))
  if (!shown.length) return null
  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]', className)}>
      {shown.map((k) => (
        <span key={k} className="flex min-w-0 max-w-full items-center" title={fieldInfo(schema, k)?.label}>
          <PropertyValue schema={schema} field={k} row={row} onOpenPage={onOpen} />
        </span>
      ))}
    </div>
  )
}

/** 「+ 新建」：点开后输入标题，回车创建，可以连续输入 */
export function NewEntryRow({
  onCreate,
  ctx,
  className,
  label = '新建'
}: {
  onCreate: ViewProps['onCreate']
  ctx: CreateContext
  className?: string
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)

  if (!open) {
    return (
      <button
        type="button"
        className={cn(
          'flex h-8 w-full items-center gap-1.5 rounded px-2 text-left text-[13px] text-muted-foreground hover:bg-hover',
          className
        )}
        onClick={() => setOpen(true)}
      >
        <Plus className="size-4" />
        {label}
      </button>
    )
  }

  const submit = async (): Promise<void> => {
    const t = title.trim()
    if (!t || busy) return
    setBusy(true)
    try {
      await onCreate(t, ctx)
      setTitle('')
    } catch {
      // 错误已经由 onCreate 提示，保留输入的标题方便修改
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={cn('flex h-8 items-center gap-1.5 rounded bg-background px-2 ring-2 ring-ring/30', className)}>
      <Plus className="size-4 shrink-0 text-muted-foreground" />
      <BareInput
        autoFocus
        value={title}
        readOnly={busy}
        placeholder="输入标题，回车创建"
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void submit()
          if (e.key === 'Escape') setOpen(false)
        }}
        onBlur={() => !title.trim() && setOpen(false)}
        className="h-7 text-[13px]"
      />
    </div>
  )
}

/** 分组对应的新建位置 */
export function groupCtx(view: ViewDef, key: string | null | undefined): CreateContext {
  return view.group && key !== undefined ? { group: { field: view.group, key } } : {}
}
