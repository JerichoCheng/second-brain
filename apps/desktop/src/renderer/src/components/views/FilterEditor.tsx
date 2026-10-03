import { useEffect, useId, useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import type { Condition, FilterItem, FilterOp, Schema } from '@shared/db'
import { OptionTag } from '@/components/properties/PropertyValue'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { api } from '@/lib/api'
import { DATE_RE } from '@/lib/dates'
import { allFields, fieldInfo } from '@/lib/fields'
import { cn } from '@/lib/utils'
import { DATE_KEYWORDS, RANGE_LABELS, initialValue, needsValue, opLabel, opsFor } from '@/lib/view-logic'

interface Props {
  schema: Schema
  filter: FilterItem[]
  onChange: (filter: FilterItem[]) => void
}

function filterable(schema: Schema) {
  return allFields(schema).filter((f) => opsFor(f.kind).length > 0)
}

function newCondition(schema: Schema): Condition {
  const field = filterable(schema).find((f) => f.key !== 'name') ?? filterable(schema)[0]!
  const op = opsFor(field.kind)[0]!
  return [field.key, op, initialValue(schema, field.key, op)]
}

/** 编辑视图的过滤条件：顶层条件之间为「与」，条件组内为「或」/「与」 */
export function FilterEditor({ schema, filter, onChange }: Props) {
  const set = (i: number, item: FilterItem | null): void => {
    const next = [...filter]
    if (item === null) next.splice(i, 1)
    else next[i] = item
    onChange(next)
  }

  return (
    <div className="w-[34rem] space-y-2 p-3 text-[13px]">
      {filter.length === 0 && <p className="text-muted-foreground">还没有过滤条件，显示全部条目。</p>}
      {filter.map((item, i) => (
        <div key={i} className="flex items-start gap-2">
          <span className="w-8 shrink-0 pt-1 text-right text-muted-foreground">{i === 0 ? '当' : '且'}</span>
          {Array.isArray(item) ? (
            <ConditionRow schema={schema} cond={item} onChange={(c) => set(i, c)} />
          ) : (
            <GroupBox schema={schema} item={item} onChange={(g) => set(i, g)} />
          )}
        </div>
      ))}
      <div className="flex gap-1 pt-1">
        <Button variant="ghost" size="sm" onClick={() => onChange([...filter, newCondition(schema)])}>
          <Plus />
          添加条件
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onChange([...filter, { any: [newCondition(schema)] }])}>
          <Plus />
          添加「或」条件组
        </Button>
      </div>
    </div>
  )
}

function GroupBox({
  schema,
  item,
  onChange
}: {
  schema: Schema
  item: { any: FilterItem[] } | { all: FilterItem[] }
  onChange: (item: FilterItem | null) => void
}) {
  const mode = 'any' in item ? 'any' : 'all'
  const items = 'any' in item ? item.any : item.all
  const update = (next: FilterItem[], m: 'any' | 'all' = mode): void => {
    if (next.length === 0) onChange(null)
    else onChange(m === 'any' ? { any: next } : { all: next })
  }

  return (
    <div className="min-w-0 flex-1 space-y-2 rounded-md border bg-muted/30 p-2">
      <div className="flex items-center gap-2">
        <Select value={mode} onChange={(e) => update(items, e.target.value as 'any' | 'all')}>
          <option value="any">满足任一条件</option>
          <option value="all">满足全部条件</option>
        </Select>
        <Button variant="ghost" size="icon" className="ml-auto size-7" onClick={() => onChange(null)} aria-label="删除条件组">
          <Trash2 className="size-3.5" />
        </Button>
      </div>
      {items.map((sub, j) =>
        Array.isArray(sub) ? (
          <ConditionRow
            key={j}
            schema={schema}
            cond={sub}
            onChange={(c) => {
              const next = [...items]
              if (c === null) next.splice(j, 1)
              else next[j] = c
              update(next)
            }}
          />
        ) : (
          // 更深的嵌套在这里只能删除，需要时直接改 schema 文件
          <div key={j} className="flex items-center gap-2 text-muted-foreground">
            <span className="flex-1">（嵌套的条件组）</span>
            <Button variant="ghost" size="icon" className="size-7" onClick={() => update(items.filter((_, k) => k !== j))}>
              <X className="size-3.5" />
            </Button>
          </div>
        )
      )}
      <Button variant="ghost" size="sm" onClick={() => update([...items, newCondition(schema)])}>
        <Plus />
        添加条件
      </Button>
    </div>
  )
}

function ConditionRow({
  schema,
  cond,
  onChange
}: {
  schema: Schema
  cond: Condition
  onChange: (c: Condition | null) => void
}) {
  const [field, op, value] = cond
  const info = fieldInfo(schema, field)
  const ops = info ? opsFor(info.kind) : []

  return (
    <div className="flex min-w-0 flex-1 items-start gap-1.5">
      <Select
        className="w-28 shrink-0"
        value={field}
        onChange={(e) => {
          const f = fieldInfo(schema, e.target.value)!
          const nextOp = opsFor(f.kind).includes(op) ? op : opsFor(f.kind)[0]!
          onChange([f.key, nextOp, initialValue(schema, f.key, nextOp)])
        }}
      >
        {!info && <option value={field}>{field}（不存在）</option>}
        {filterable(schema).map((f) => (
          <option key={f.key} value={f.key}>
            {f.label}
          </option>
        ))}
      </Select>
      <Select
        className="w-24 shrink-0"
        value={op}
        onChange={(e) => {
          const nextOp = e.target.value as FilterOp
          const keep = needsValue(nextOp) && nextOp !== 'within' && op !== 'within' && needsValue(op)
          onChange([field, nextOp, keep ? value : initialValue(schema, field, nextOp)])
        }}
      >
        {!ops.includes(op) && <option value={op}>{op}</option>}
        {(info ? ops : []).map((o) => (
          <option key={o} value={o}>
            {info ? opLabel(info.kind, o) : o}
          </option>
        ))}
      </Select>
      <div className="min-w-0 flex-1">
        {info && needsValue(op) && (
          <ValueInput schema={schema} field={field} op={op} value={value} onChange={(v) => onChange([field, op, v])} />
        )}
      </div>
      <Button variant="ghost" size="icon" className="size-7 shrink-0" onClick={() => onChange(null)} aria-label="删除条件">
        <X className="size-3.5" />
      </Button>
    </div>
  )
}

function ValueInput({
  schema,
  field,
  op,
  value,
  onChange
}: {
  schema: Schema
  field: string
  op: FilterOp
  value: unknown
  onChange: (v: unknown) => void
}) {
  const info = fieldInfo(schema, field)!
  const listId = useId()

  if (op === 'within') {
    return (
      <Select className="w-full" value={String(value)} onChange={(e) => onChange(e.target.value)}>
        {Object.entries(RANGE_LABELS).map(([k, label]) => (
          <option key={k} value={k}>
            {label}
          </option>
        ))}
      </Select>
    )
  }

  switch (info.kind) {
    case 'checkbox':
    case 'overdue':
      return (
        <Select className="w-full" value={String(value === true || value === 'true')} onChange={(e) => onChange(e.target.value === 'true')}>
          <option value="true">已勾选</option>
          <option value="false">未勾选</option>
        </Select>
      )
    case 'date':
      return <DateValue value={value} onChange={onChange} />
    case 'select':
    case 'status':
    case 'multi_select': {
      const options = info.def?.options ?? []
      if (!options.length) break
      // 「是 / 不是」可以选多个值（是其中之一）；「包含」只选一个
      const multi = op === 'is' || op === 'is_not'
      const selected = (Array.isArray(value) ? value : value === undefined || value === '' ? [] : [value]).map(String)
      return (
        <div className="flex flex-wrap gap-1 pt-0.5">
          {options.map((o) => {
            const on = selected.includes(o)
            return (
              <button
                key={o}
                type="button"
                onClick={() => {
                  if (!multi) return onChange(o)
                  const next = on ? selected.filter((x) => x !== o) : [...selected, o]
                  onChange(next.length === 1 ? next[0] : next)
                }}
                className={cn('rounded ring-offset-1 ring-offset-popover', on ? 'ring-2 ring-ring' : 'opacity-60 hover:opacity-100')}
              >
                <OptionTag def={info.def} value={o} />
              </button>
            )
          })}
        </div>
      )
    }
    case 'relation':
      return (
        <>
          <Input
            className="h-7"
            list={listId}
            value={String(value ?? '')}
            placeholder="页面名"
            onChange={(e) => onChange(e.target.value)}
          />
          <RelationOptions id={listId} db={info.def?.to} />
        </>
      )
    case 'number':
    case 'count':
    case 'progress':
      return (
        <Input
          className="h-7"
          type="number"
          step={info.kind === 'progress' ? 0.1 : 'any'}
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        />
      )
  }
  return <Input className="h-7" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />
}

/** 日期值：今天 / 明天 / 昨天，或者指定日期 */
function DateValue({ value, onChange }: { value: unknown; onChange: (v: unknown) => void }) {
  const v = String(value ?? '')
  const isKeyword = v in DATE_KEYWORDS
  return (
    <div className="flex gap-1.5">
      <Select
        className="w-24 shrink-0"
        value={isKeyword ? v : 'exact'}
        onChange={(e) => onChange(e.target.value === 'exact' ? (DATE_RE.test(v) ? v : '') : e.target.value)}
      >
        {Object.entries(DATE_KEYWORDS).map(([k, label]) => (
          <option key={k} value={k}>
            {label}
          </option>
        ))}
        <option value="exact">指定日期</option>
      </Select>
      {!isKeyword && (
        <Input className="h-7 min-w-0" type="date" value={v.slice(0, 10)} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  )
}

function RelationOptions({ id, db }: { id: string; db?: string }) {
  const [names, setNames] = useState<string[]>([])
  useEffect(() => {
    if (db) api.db.names(db).then(setNames, () => setNames([]))
  }, [db])
  return (
    <datalist id={id}>
      {names.map((n) => (
        <option key={n} value={n} />
      ))}
    </datalist>
  )
}

// ---------------------------------------------------------------- 排序

export function SortEditor({
  schema,
  sort,
  onChange
}: {
  schema: Schema
  sort: string[]
  onChange: (sort: string[]) => void
}) {
  const fields = allFields(schema)
  const set = (i: number, s: string | null): void => {
    const next = [...sort]
    if (s === null) next.splice(i, 1)
    else next[i] = s
    onChange(next)
  }
  const unused = fields.find((f) => !sort.some((s) => s.replace(/^-/, '') === f.key))

  return (
    <div className="w-80 space-y-2 p-3 text-[13px]">
      {sort.length === 0 && <p className="text-muted-foreground">按标题排序。</p>}
      {sort.map((s, i) => {
        const key = s.replace(/^-/, '')
        const desc = s.startsWith('-')
        return (
          <div key={i} className="flex items-center gap-1.5">
            <Select className="min-w-0 flex-1" value={key} onChange={(e) => set(i, (desc ? '-' : '') + e.target.value)}>
              {!fieldInfo(schema, key) && <option value={key}>{key}（不存在）</option>}
              {fields.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </Select>
            <Select className="w-20" value={desc ? 'desc' : 'asc'} onChange={(e) => set(i, (e.target.value === 'desc' ? '-' : '') + key)}>
              <option value="asc">升序</option>
              <option value="desc">降序</option>
            </Select>
            <Button variant="ghost" size="icon" className="size-7" onClick={() => set(i, null)} aria-label="删除排序">
              <X className="size-3.5" />
            </Button>
          </div>
        )
      })}
      {unused && (
        <Button variant="ghost" size="sm" onClick={() => onChange([...sort, unused.key])}>
          <Plus />
          添加排序
        </Button>
      )}
      <p className="text-[12px] text-muted-foreground">选项按 schema 里的顺序排；空值总在最后。</p>
    </div>
  )
}
