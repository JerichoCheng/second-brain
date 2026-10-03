import { useEffect, useRef, useState } from 'react'
import type { Row, Schema, Value } from '@shared/db'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { BareInput } from '@/components/ui/input'
import { useToast } from '@/hooks/toast'
import { api } from '@/lib/api'
import { fieldInfo, rangeStart, type FieldInfo } from '@/lib/fields'
import { cn } from '@/lib/utils'
import { isEmptyValue } from '@/lib/view-logic'
import { DateEditor } from './DateEditor'
import { Picker } from './Picker'
import { OptionTag, PropertyValue, RelationChip } from './PropertyValue'

export interface PropertyCellProps {
  schema: Schema
  field: string
  row: Row
  /** 写入字段（可以一次写多个，比如日期区间的开始和结束） */
  onCommit: (patch: Record<string, unknown>) => void
  /** 改标题 = 重命名文件 */
  onRename?: (title: string) => void
  onOpenPage?: (name: string) => void
  /** 自由填写的多选字段的候选值（当前视图里已经出现过的值） */
  suggestions?: string[]
  variant: 'table' | 'panel'
  className?: string
}

const INLINE = new Set(['title', 'text', 'number', 'url', 'recurrence'])
const POPOVER = new Set(['select', 'status', 'multi_select', 'relation', 'date'])

function asList(v: Value | undefined): string[] {
  if (Array.isArray(v)) return v
  return v === null || v === undefined || v === '' ? [] : [String(v)]
}

/** 显示一个字段，点击后就地编辑：文字类直接变输入框，选项、日期、关联弹出选择框 */
export function PropertyCell(props: PropertyCellProps) {
  const { schema, field, row, onCommit, onOpenPage, variant, className } = props
  const info = fieldInfo(schema, field)
  const [editing, setEditing] = useState(false)
  const pending = useRef<Record<string, unknown> | null>(null)

  if (!info) return null
  const editable = info.editable && !row.error && (INLINE.has(info.kind) || POPOVER.has(info.kind) || info.kind === 'checkbox')
  const box = cn(
    'flex min-h-8 w-full min-w-0 items-center px-2 text-left',
    variant === 'table' ? 'h-full py-1' : 'rounded py-1',
    editable && variant === 'panel' && 'hover:bg-hover',
    editable && 'cursor-default',
    className
  )

  // 面板里的空值显示占位文字，否则看不出那里可以点
  const blank = info.kind !== 'title' && info.kind !== 'checkbox' && isEmptyValue(row.values[field])
  const display =
    blank && variant === 'panel' ? (
      <span className="text-muted-foreground/70">空</span>
    ) : (
      <PropertyValue schema={schema} field={field} row={row} onOpenPage={onOpenPage} wrap={variant === 'panel'} />
    )

  if (!editable) {
    return <div className={box}>{display}</div>
  }

  if (info.kind === 'checkbox') {
    return (
      <button
        type="button"
        className={box}
        onClick={() => onCommit({ [field]: row.values[field] !== true })}
        aria-pressed={row.values[field] === true}
        aria-label={info.label}
      >
        {display}
      </button>
    )
  }

  if (INLINE.has(info.kind)) {
    if (editing) return <InlineEditor {...props} info={info} box={box} onDone={() => setEditing(false)} />
    return (
      <div className={box} onClick={() => setEditing(true)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setEditing(true)}>
        {display}
      </div>
    )
  }

  const close = (): void => {
    if (pending.current) onCommit(pending.current)
    pending.current = null
    setEditing(false)
  }

  return (
    <Popover open={editing} onOpenChange={(open) => (open ? setEditing(true) : close())}>
      <PopoverAnchor asChild>
        <div
          className={cn(box, editing && 'ring-2 ring-ring/30 ring-inset')}
          onClick={() => setEditing(true)}
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && setEditing(true)}
        >
          {display}
        </div>
      </PopoverAnchor>
      <PopoverContent onClick={(e) => e.stopPropagation()}>
        <PopoverEditor
          {...props}
          info={info}
          setPending={(p) => (pending.current = p)}
          commitNow={(p) => {
            pending.current = null
            onCommit(p)
            setEditing(false)
          }}
          close={close}
        />
      </PopoverContent>
    </Popover>
  )
}

// ---------------------------------------------------------------- 文字类

function InlineEditor({
  row,
  field,
  info,
  box,
  onCommit,
  onRename,
  onDone
}: PropertyCellProps & { info: FieldInfo; box: string; onDone: () => void }) {
  const initial = info.kind === 'title' ? row.name : (row.values[field] ?? '')
  const [text, setText] = useState(String(initial))
  const done = useRef(false)

  const commit = (): void => {
    if (done.current) return
    done.current = true
    const t = text.trim()
    if (info.kind === 'title') {
      if (t && t !== row.name) onRename?.(t)
    } else if (t !== String(initial).trim()) {
      onCommit({ [field]: info.kind === 'number' ? (t === '' ? null : Number(t)) : t })
    }
    onDone()
  }

  return (
    <div className={cn(box, 'bg-background ring-2 ring-ring/30 ring-inset')}>
      <BareInput
        autoFocus
        value={text}
        inputMode={info.kind === 'number' ? 'decimal' : undefined}
        onFocus={(e) => e.target.select()}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') {
            done.current = true
            onDone()
          }
        }}
        className={cn('h-6', info.kind === 'title' && 'font-medium')}
      />
    </div>
  )
}

// ---------------------------------------------------------------- 弹出类

interface PopoverEditorProps extends PropertyCellProps {
  info: FieldInfo
  setPending: (patch: Record<string, unknown>) => void
  commitNow: (patch: Record<string, unknown>) => void
  close: () => void
}

function PopoverEditor(props: PopoverEditorProps) {
  const { info, row, field, setPending, commitNow, close } = props
  const def = info.def!

  if (info.kind === 'date') {
    const startField = rangeStart(def)
    return (
      <DateEditor
        initial={{
          value: (row.values[field] as string | null) ?? null,
          ...(startField ? { start: (row.values[startField] as string | null) ?? null } : {})
        }}
        rangeCapable={!!startField}
        onChange={(next) =>
          setPending({ [field]: next.value, ...(startField ? { [startField]: next.start ?? null } : {}) })
        }
        onDone={close}
      />
    )
  }

  if (info.kind === 'relation') return <RelationEditor {...props} />

  const options = def.options ?? []
  const current = asList(row.values[field])

  if (info.kind === 'multi_select') {
    return <MultiSelectEditor {...props} options={options} current={current} />
  }

  // select / status：选一个就关闭
  return (
    <Picker
      items={options}
      selected={current}
      multiple={false}
      renderItem={(v) => <OptionTag def={def} value={v} />}
      onToggle={(v) => commitNow({ [field]: v })}
      placeholder="选择或搜索…"
      footer={
        current.length > 0 && (
          <button
            type="button"
            className="h-7 w-full rounded px-2 text-left text-[13px] text-muted-foreground hover:bg-hover"
            onClick={() => commitNow({ [field]: null })}
          >
            清除
          </button>
        )
      }
    />
  )
}

function MultiSelectEditor({
  info,
  field,
  options,
  current,
  suggestions,
  setPending
}: PopoverEditorProps & { options: string[]; current: string[] }) {
  const [selected, setSelected] = useState(current)
  // options 为空表示自由填写：候选值来自当前视图里出现过的值
  const free = options.length === 0
  const items = free ? [...new Set([...(suggestions ?? []), ...selected])].sort() : options

  const set = (next: string[]): void => {
    setSelected(next)
    setPending({ [field]: next })
  }

  return (
    <Picker
      items={items}
      selected={selected}
      multiple
      renderItem={(v) => <OptionTag def={info.def} value={v} />}
      onToggle={(v) => set(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v])}
      onCreate={free ? (t) => !selected.includes(t) && set([...selected, t]) : undefined}
      placeholder={free ? '搜索或输入新标签…' : '搜索…'}
    />
  )
}

function RelationEditor({ info, field, row, setPending, commitNow }: PopoverEditorProps) {
  const def = info.def!
  const toast = useToast()
  const [names, setNames] = useState<string[] | null>(null)
  const [selected, setSelected] = useState(asList(row.values[field]))
  const multiple = def.multiple === true

  useEffect(() => {
    if (!def.to) return
    api.db.names(def.to).then(setNames, (err) => {
      toast.error(err)
      setNames([])
    })
  }, [def.to, toast])

  const choose = (name: string): void => {
    if (!multiple) {
      commitNow({ [field]: selected.includes(name) ? null : name })
      return
    }
    const next = selected.includes(name) ? selected.filter((x) => x !== name) : [...selected, name]
    setSelected(next)
    setPending({ [field]: next })
  }

  return (
    <Picker
      items={names ?? []}
      loading={names === null}
      selected={selected}
      multiple={multiple}
      renderItem={(v) => <RelationChip name={v} />}
      onToggle={choose}
      onCreate={
        def.to
          ? (title) =>
              void api.entry
                .create(def.to!, title)
                .then((created) => {
                  setNames((n) => [...(n ?? []), created.name])
                  choose(created.name)
                })
                .catch(toast.error)
          : undefined
      }
      placeholder="搜索页面…"
    />
  )
}
