import { useEffect, useMemo, useState } from 'react'
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
import type { Row } from '@shared/db'
import { cn } from '@/lib/utils'
import { CardProperties, GroupLabel, NewEntryRow, StatusToggle, sections, type ViewProps } from './common'

const NONE = '\u0000none'

const toId = (key: string | null): string => (key === null ? NONE : key)
const fromId = (id: string): string | null => (id === NONE ? null : id)

/** 看板：按 select / status 分列，把卡片拖到另一列就修改分组字段 */
export function BoardView(props: ViewProps) {
  const { view, data, onPatch, onCreate } = props
  const field = view.group!
  // 拖完先在界面上挪过去，主进程推来新结果后再以文件为准
  const [moves, setMoves] = useState<Record<string, string | null>>({})
  const [dragging, setDragging] = useState<Row | null>(null)
  useEffect(() => setMoves({}), [data.groups])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const columns = useMemo(() => {
    const parts = sections(data).map((s) => ({ key: s.key ?? null, rows: s.rows }))
    const moved = Object.entries(moves)
    if (!moved.length) return parts
    const byPath = new Map(data.rows.map((r) => [r.path, r]))
    return parts.map((col) => ({
      key: col.key,
      rows: [
        ...col.rows.filter((r) => !(r.path in moves)),
        ...moved.filter(([, k]) => k === col.key).map(([p]) => byPath.get(p)!).filter(Boolean)
      ]
    }))
  }, [data, moves])

  const onDragStart = (e: DragStartEvent): void => {
    setDragging(data.rows.find((r) => r.path === e.active.id) ?? null)
  }

  const onDragEnd = (e: DragEndEvent): void => {
    setDragging(null)
    if (!e.over) return
    const from = e.active.data.current?.from as string | null
    const to = fromId(String(e.over.id))
    if (from === to) return
    const row = data.rows.find((r) => r.path === e.active.id)
    if (!row || row.error) return
    setMoves((m) => ({ ...m, [row.path]: to }))
    onPatch(row, { [field]: to })
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragging(null)}
    >
      <div className="flex min-h-[calc(100vh-14rem)] items-stretch gap-3 overflow-x-auto pb-6">
        {columns.map((col) => (
          <Column key={toId(col.key)} groupKey={col.key} count={col.rows.length} {...props}>
            {col.rows.map((row) => (
              <Card key={row.path} row={row} from={col.key} {...props} />
            ))}
            <NewEntryRow onCreate={onCreate} ctx={{ group: { field, key: col.key } }} />
          </Column>
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {dragging && <CardBody row={dragging} {...props} className="rotate-1 shadow-lg" />}
      </DragOverlay>
    </DndContext>
  )
}

function Column({
  groupKey,
  count,
  schema,
  view,
  children
}: ViewProps & { groupKey: string | null; count: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: toId(groupKey) })
  return (
    <section
      ref={setNodeRef}
      className={cn('flex w-64 shrink-0 flex-col gap-1.5 rounded-lg p-1.5 transition-colors', isOver ? 'bg-selected' : 'bg-muted/50')}
      aria-label={groupKey ?? '无'}
    >
      <header className="flex h-7 items-center gap-2 px-1">
        <GroupLabel schema={schema} field={view.group!} groupKey={groupKey} />
        <span className="text-[13px] text-muted-foreground tabular-nums">{count}</span>
      </header>
      {children}
    </section>
  )
}

function Card({ row, from, ...props }: ViewProps & { row: Row; from: string | null }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: row.path, data: { from } })
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} className={cn('outline-none', isDragging && 'opacity-40')}>
      <CardBody row={row} {...props} />
    </div>
  )
}

function CardBody({ row, schema, columns, onOpen, onPatch, className }: ViewProps & { row: Row; className?: string }) {
  return (
    <article
      onClick={() => onOpen(row.path)}
      className={cn(
        'cursor-default rounded-md border bg-background px-2.5 py-2 shadow-xs hover:bg-hover/60',
        className
      )}
    >
      <div className="flex items-start gap-1.5">
        <span className="mt-px">
          <StatusToggle schema={schema} row={row} onPatch={onPatch} />
        </span>
        <span className="min-w-0 flex-1 font-medium break-words">{row.name}</span>
      </div>
      <CardProperties schema={schema} row={row} columns={columns} onOpen={onOpen} className="mt-1.5 pl-6.5" />
    </article>
  )
}
