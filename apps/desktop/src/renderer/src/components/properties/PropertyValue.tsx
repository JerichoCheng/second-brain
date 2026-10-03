import { Check, FileText } from 'lucide-react'
import type { FieldDef, Row, Schema, Value } from '@shared/db'
import { formatDate, formatTimestamp } from '@/lib/dates'
import { fieldInfo, rangeStart, tagColor, type TagColor } from '@/lib/fields'
import { cn } from '@/lib/utils'

interface TagProps {
  def?: FieldDef
  value: string
  /** 不按选项取色，直接指定 */
  color?: TagColor
  className?: string
}

export function OptionTag({ def, value, color = tagColor(def, value), className }: TagProps) {
  return (
    <span
      className={cn('inline-flex h-5 max-w-full shrink-0 items-center rounded px-1.5 text-[12px] leading-none', className)}
      style={{ background: `var(--tag-${color})`, color: `var(--tag-${color}-fg)` }}
    >
      <span className="truncate">{value}</span>
    </span>
  )
}

export function CheckboxMark({ checked, className }: { checked: boolean; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex size-4 shrink-0 items-center justify-center rounded-[3px] border',
        checked ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-background',
        className
      )}
      aria-hidden
    >
      {checked && <Check className="size-3" strokeWidth={3} />}
    </span>
  )
}

export function RelationChip({ name, onOpen }: { name: string; onOpen?: (name: string) => void }) {
  return (
    <span
      role={onOpen ? 'link' : undefined}
      className={cn(
        'inline-flex h-5 max-w-full shrink-0 items-center gap-1 text-[13px] leading-none',
        onOpen && 'cursor-pointer underline decoration-border underline-offset-[3px] hover:decoration-foreground'
      )}
      onClick={
        onOpen
          ? (e) => {
              e.stopPropagation()
              onOpen(name)
            }
          : undefined
      }
    >
      <FileText className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate">{name}</span>
    </span>
  )
}

/** 某个日期字段是否被 overdue 计算字段判定为逾期 */
function isOverdue(schema: Schema, row: Row, field: string): boolean {
  return Object.entries(schema.computed).some(([k, c]) => c.fn === 'overdue' && c.field === field && row.values[k] === true)
}

function urlLabel(url: string): string {
  try {
    const u = new URL(url)
    return u.hostname.replace(/^www\./, '') + (u.pathname === '/' ? '' : u.pathname)
  } catch {
    return url
  }
}

function asList(v: Value | undefined): string[] {
  if (Array.isArray(v)) return v
  return v === null || v === undefined || v === '' ? [] : [String(v)]
}

interface Props {
  schema: Schema
  field: string
  row: Row
  /** 点击关联的页面 */
  onOpenPage?: (name: string) => void
  /** 卡片里显示：只换行不截断 */
  wrap?: boolean
}

/** 只读显示一个字段的值；空值返回 null */
export function PropertyValue({ schema, field, row, onOpenPage, wrap }: Props) {
  const info = fieldInfo(schema, field)
  if (!info) return null
  const v = row.values[field]
  const flex = cn('flex min-w-0 items-center gap-1', wrap ? 'flex-wrap' : 'overflow-hidden')

  switch (info.kind) {
    case 'title':
      return <span className="truncate font-medium">{row.name}</span>
    case 'text':
    case 'recurrence':
      return v ? <span className={wrap ? 'break-words' : 'truncate'}>{String(v)}</span> : null
    case 'number':
    case 'count':
      return typeof v === 'number' ? <span className="tabular-nums">{v.toLocaleString('zh-CN')}</span> : null
    case 'checkbox':
      return <CheckboxMark checked={v === true} />
    case 'select':
    case 'status':
      return v ? <OptionTag def={info.def} value={String(v)} /> : null
    case 'multi_select': {
      const list = asList(v)
      if (!list.length) return null
      return (
        <span className={flex}>
          {list.map((x) => (
            <OptionTag key={x} def={info.def} value={x} />
          ))}
        </span>
      )
    }
    case 'relation': {
      const list = asList(v)
      if (!list.length) return null
      return (
        <span className={cn(flex, 'gap-x-2.5')}>
          {list.map((x) => (
            <RelationChip key={x} name={x} onOpen={onOpenPage} />
          ))}
        </span>
      )
    }
    case 'date': {
      if (typeof v !== 'string') return null
      const startField = rangeStart(info.def)
      const start = startField ? row.values[startField] : null
      const late = isOverdue(schema, row, field)
      return (
        <span className={cn('truncate tabular-nums', late && 'text-destructive')}>
          {typeof start === 'string' && start ? `${formatDate(start)} → ${formatDate(v)}` : formatDate(v)}
        </span>
      )
    }
    case 'url':
      return typeof v === 'string' && v ? (
        <a
          href={v}
          target="_blank"
          rel="noreferrer"
          className="truncate text-muted-foreground underline decoration-border underline-offset-[3px] hover:text-foreground"
          onClick={(e) => e.stopPropagation()}
          title={v}
        >
          {urlLabel(v)}
        </a>
      ) : null
    case 'overdue':
      return v === true ? <OptionTag value="逾期" color="red" /> : null
    case 'progress': {
      if (typeof v !== 'number') return null
      const pct = Math.round(v * 100)
      return (
        <span className="flex min-w-0 items-center gap-2">
          <span className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-muted">
            <span className="block h-full rounded-full bg-success" style={{ width: `${pct}%` }} />
          </span>
          <span className="text-[12px] text-muted-foreground tabular-nums">{pct}%</span>
        </span>
      )
    }
    case 'mtime':
      return typeof v === 'number' ? <span className="truncate text-muted-foreground">{formatTimestamp(v)}</span> : null
  }
}
