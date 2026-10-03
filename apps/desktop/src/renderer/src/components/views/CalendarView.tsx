import { useMemo, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent
} from '@dnd-kit/core'
import { CalendarOff, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import type { Row } from '@shared/db'
import { Button } from '@/components/ui/button'
import { dayDiff, dayOf, formatMonth, monthGrid, parseDay, shiftDate, timeOf, today, weekdayNames } from '@/lib/dates'
import { fieldInfo, rangeStart } from '@/lib/fields'
import { cn } from '@/lib/utils'
import type { ViewProps } from './common'

/** 区间最多铺开多少天，防止写错的日期铺满整个日历 */
const MAX_SPAN = 62
const UNDATED = 'undated'

interface Placed {
  row: Row
  /** 区间的第一天 / 最后一天 */
  first: boolean
  last: boolean
}

/** 日历：按日期字段排在月历上，拖到另一天就改日期（区间整体平移） */
export function CalendarView(props: ViewProps) {
  const { schema, view, data, onPatch, onCreate, onOpen } = props
  const field = view.date!
  const startField = rangeStart(fieldInfo(schema, field)?.def)
  const [cursor, setCursor] = useState(() => parseDay(today()))
  const [showUndated, setShowUndated] = useState(false)
  const [adding, setAdding] = useState<string | null>(null)
  const [dragging, setDragging] = useState<Row | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const year = cursor.getFullYear()
  const month = cursor.getMonth()
  const grid = monthGrid(year, month)
  const now = today()

  const { byDay, undated } = useMemo(() => {
    const byDay = new Map<string, Placed[]>()
    const undated: Row[] = []
    for (const row of data.rows) {
      const end = row.values[field]
      if (typeof end !== 'string' || !end) {
        undated.push(row)
        continue
      }
      const start = startField ? row.values[startField] : null
      let a = typeof start === 'string' && start ? dayOf(start) : dayOf(end)
      let b = dayOf(end)
      if (a > b) [a, b] = [b, a]
      const span = Math.min(dayDiff(a, b), MAX_SPAN)
      for (let i = 0; i <= span; i++) {
        const d = shiftDate(a, i)
        if (!byDay.has(d)) byDay.set(d, [])
        byDay.get(d)!.push({ row, first: i === 0, last: i === span })
      }
    }
    // 同一天里：带时间的按时间排，全天的在前
    for (const list of byDay.values()) {
      list.sort((x, y) => (timeOf(String(x.row.values[field])) ?? '').localeCompare(timeOf(String(y.row.values[field])) ?? ''))
    }
    return { byDay, undated }
  }, [data.rows, field, startField])

  const onDragStart = (e: DragStartEvent): void => {
    setDragging(data.rows.find((r) => r.path === e.active.data.current?.path) ?? null)
  }

  const onDragEnd = (e: DragEndEvent): void => {
    setDragging(null)
    const target = e.over ? String(e.over.id) : null
    const path = e.active.data.current?.path as string | undefined
    const from = e.active.data.current?.day as string | null
    const row = data.rows.find((r) => r.path === path)
    if (!row || !target || row.error) return

    if (target === UNDATED) {
      if (from !== null) onPatch(row, { [field]: null, ...(startField ? { [startField]: null } : {}) })
      return
    }
    if (from === null) {
      onPatch(row, { [field]: target })
      return
    }
    const delta = dayDiff(from, target)
    if (!delta) return
    const end = String(row.values[field])
    const start = startField ? row.values[startField] : null
    onPatch(row, {
      [field]: shiftDate(end, delta),
      ...(startField && typeof start === 'string' && start ? { [startField]: shiftDate(start, delta) } : {})
    })
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragging(null)}
    >
      <div className="flex gap-4 pb-6">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center gap-1">
            <h2 className="mr-2 text-base font-semibold">{formatMonth(year, month)}</h2>
            <Button variant="ghost" size="icon" className="size-7" onClick={() => setCursor(new Date(year, month - 1, 1))} aria-label="上个月">
              <ChevronLeft />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setCursor(parseDay(now))}>
              今天
            </Button>
            <Button variant="ghost" size="icon" className="size-7" onClick={() => setCursor(new Date(year, month + 1, 1))} aria-label="下个月">
              <ChevronRight />
            </Button>
            <Button
              variant={showUndated ? 'secondary' : 'ghost'}
              size="sm"
              className="ml-auto text-muted-foreground"
              onClick={() => setShowUndated((s) => !s)}
            >
              <CalendarOff />
              无日期 {undated.length}
            </Button>
          </div>

          <div className="grid grid-cols-7 overflow-hidden rounded-md border">
            {weekdayNames().map((w) => (
              <div key={w} className="border-b bg-muted/40 px-2 py-1 text-[12px] text-muted-foreground">
                {w}
              </div>
            ))}
            {grid.map((day, i) => (
              <DayCell
                key={day}
                day={day}
                inMonth={parseDay(day).getMonth() === month}
                isToday={day === now}
                lastCol={i % 7 === 6}
                items={byDay.get(day) ?? []}
                adding={adding === day}
                onAdd={() => setAdding(day)}
                onAddDone={() => setAdding(null)}
                onCreate={(title) => onCreate(title, { date: { field, day } })}
                onOpen={onOpen}
              />
            ))}
          </div>
        </div>

        {showUndated && <UndatedList rows={undated} onOpen={onOpen} />}
      </div>
      <DragOverlay dropAnimation={null}>
        {dragging && <Chip row={dragging} field={field} className="w-40 shadow-lg" />}
      </DragOverlay>
    </DndContext>
  )
}

function DayCell({
  day,
  inMonth,
  isToday,
  lastCol,
  items,
  adding,
  onAdd,
  onAddDone,
  onCreate,
  onOpen
}: {
  day: string
  inMonth: boolean
  isToday: boolean
  lastCol: boolean
  items: Placed[]
  adding: boolean
  onAdd: () => void
  onAddDone: () => void
  onCreate: (title: string) => Promise<void>
  onOpen: (path: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: day })
  const [title, setTitle] = useState('')
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'group/day flex min-h-28 min-w-0 flex-col gap-0.5 border-b p-1',
        !lastCol && 'border-r',
        !inMonth && 'bg-muted/30',
        isOver && 'bg-selected'
      )}
    >
      <div className="flex h-6 items-center justify-between px-1">
        <span
          className={cn(
            'flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[12px] tabular-nums',
            isToday ? 'bg-primary font-semibold text-primary-foreground' : inMonth ? '' : 'text-muted-foreground'
          )}
        >
          {Number(day.slice(8))}
        </span>
        <button
          type="button"
          onClick={onAdd}
          className="hidden rounded p-0.5 text-muted-foreground group-hover/day:block hover:bg-hover"
          aria-label={`在 ${day} 新建`}
        >
          <Plus className="size-3.5" />
        </button>
      </div>
      {items.map((p) => (
        <DraggableChip key={p.row.path} placed={p} day={day} onOpen={onOpen} />
      ))}
      {adding && (
        <input
          autoFocus
          value={title}
          placeholder="标题"
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && title.trim()) {
              void onCreate(title.trim()).then(() => setTitle(''))
            }
            if (e.key === 'Escape') onAddDone()
          }}
          onBlur={() => {
            setTitle('')
            onAddDone()
          }}
          className="h-6 w-full rounded border border-ring bg-background px-1.5 text-[12px] outline-none"
        />
      )}
    </div>
  )
}

function DraggableChip({ placed, day, onOpen }: { placed: Placed; day: string; onOpen: (path: string) => void }) {
  const { row, first, last } = placed
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `${row.path}\u0000${day}`,
    data: { path: row.path, day }
  })
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} className={cn('outline-none', isDragging && 'opacity-40')}>
      <Chip row={row} onOpen={onOpen} continues={{ before: !first, after: !last }} />
    </div>
  )
}

function Chip({
  row,
  field,
  onOpen,
  continues,
  className
}: {
  row: Row
  field?: string
  onOpen?: (path: string) => void
  continues?: { before: boolean; after: boolean }
  className?: string
}) {
  const time = field ? timeOf(String(row.values[field] ?? '')) : null
  return (
    <div
      onClick={onOpen ? () => onOpen(row.path) : undefined}
      title={row.name}
      className={cn(
        'flex h-6 cursor-default items-center gap-1 truncate rounded border bg-background px-1.5 text-[12px] shadow-xs hover:bg-hover',
        continues?.before && 'rounded-l-none border-l-2 border-l-primary/50',
        continues?.after && 'rounded-r-none',
        className
      )}
    >
      {time && <span className="text-muted-foreground tabular-nums">{time}</span>}
      <span className="truncate">{row.name}</span>
    </div>
  )
}

function UndatedList({ rows, onOpen }: { rows: Row[]; onOpen: (path: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: UNDATED })
  return (
    <aside
      ref={setNodeRef}
      className={cn('w-56 shrink-0 self-start rounded-md border p-2', isOver && 'bg-selected')}
      aria-label="无日期"
    >
      <p className="mb-2 text-[12px] text-muted-foreground">拖到日历上设置日期；拖回这里清除日期。</p>
      <div className="flex flex-col gap-1">
        {rows.map((row) => (
          <UndatedChip key={row.path} row={row} onOpen={onOpen} />
        ))}
        {rows.length === 0 && <p className="text-[13px] text-muted-foreground">没有</p>}
      </div>
    </aside>
  )
}

function UndatedChip({ row, onOpen }: { row: Row; onOpen: (path: string) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `${row.path}\u0000undated`,
    data: { path: row.path, day: null }
  })
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} className={cn('outline-none', isDragging && 'opacity-40')}>
      <Chip row={row} onOpen={onOpen} />
    </div>
  )
}
