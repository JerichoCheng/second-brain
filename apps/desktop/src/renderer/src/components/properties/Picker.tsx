import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Plus, X } from 'lucide-react'
import { BareInput } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface Props {
  /** 可选的值 */
  items: string[]
  selected: string[]
  multiple: boolean
  renderItem: (value: string) => React.ReactNode
  /** 单选时表示选中，多选时表示切换 */
  onToggle: (value: string) => void
  /** 允许新建时提供：输入的文字没有完全匹配的项时显示「新建」 */
  onCreate?: (text: string) => void
  placeholder?: string
  loading?: boolean
  footer?: React.ReactNode
}

const LIMIT = 100

/** 带搜索的选择列表：选项、多选标签、关联页面都用它 */
export function Picker({
  items,
  selected,
  multiple,
  renderItem,
  onToggle,
  onCreate,
  placeholder = '搜索…',
  loading,
  footer
}: Props) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  const q = query.trim().toLowerCase()
  const filtered = useMemo(
    () => (q ? items.filter((i) => i.toLowerCase().includes(q)) : items).slice(0, LIMIT),
    [items, q]
  )
  const canCreate = onCreate && q !== '' && !items.some((i) => i.toLowerCase() === q)
  const total = filtered.length + (canCreate ? 1 : 0)

  useEffect(() => setActive(0), [q])
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const choose = (index: number): void => {
    if (index < filtered.length) onToggle(filtered[index]!)
    else if (canCreate) onCreate!(query.trim())
    else return
    setQuery('')
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, total - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      choose(active)
    } else if (e.key === 'Backspace' && query === '' && multiple && selected.length) {
      onToggle(selected[selected.length - 1]!)
    }
  }

  return (
    <div className="flex w-72 flex-col">
      <div className="flex flex-wrap items-center gap-1 border-b bg-muted/40 px-2 py-1.5">
        {multiple &&
          selected.map((s) => (
            <span key={s} className="inline-flex max-w-full items-center gap-0.5">
              {renderItem(s)}
              <button
                type="button"
                className="rounded p-0.5 text-muted-foreground hover:bg-hover"
                onClick={() => onToggle(s)}
                aria-label={`移除 ${s}`}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        <BareInput
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className="h-6 min-w-24 flex-1 text-[13px]"
        />
      </div>
      <div ref={listRef} className="max-h-72 overflow-y-auto p-1" role="listbox">
        {loading && <p className="px-2 py-1.5 text-[13px] text-muted-foreground">加载中…</p>}
        {!loading && total === 0 && (
          <p className="px-2 py-1.5 text-[13px] text-muted-foreground">{q ? '没有匹配的项' : '没有可选的项'}</p>
        )}
        {filtered.map((item, i) => {
          const on = selected.includes(item)
          return (
            <div
              key={item}
              data-index={i}
              role="option"
              aria-selected={on}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(i)}
              className={cn(
                'flex h-7 cursor-default items-center gap-2 rounded px-2 text-[13px]',
                active === i && 'bg-accent'
              )}
            >
              <span className="flex min-w-0 flex-1 items-center">{renderItem(item)}</span>
              {on && <Check className="size-4 shrink-0 text-muted-foreground" />}
            </div>
          )
        })}
        {canCreate && (
          <div
            data-index={filtered.length}
            role="option"
            aria-selected={false}
            onMouseEnter={() => setActive(filtered.length)}
            onClick={() => choose(filtered.length)}
            className={cn(
              'flex h-7 cursor-default items-center gap-2 rounded px-2 text-[13px]',
              active === filtered.length && 'bg-accent'
            )}
          >
            <Plus className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">新建「{query.trim()}」</span>
          </div>
        )}
      </div>
      {footer && <div className="border-t p-1">{footer}</div>}
    </div>
  )
}
