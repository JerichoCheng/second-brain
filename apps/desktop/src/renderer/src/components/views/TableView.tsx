import { useEffect, useMemo, useState } from 'react'
import {
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnSizingState,
  type Header
} from '@tanstack/react-table'
import { ArrowDownWideNarrow, ArrowUpNarrowWide, ChevronDown, ChevronRight, EyeOff, Maximize2 } from 'lucide-react'
import type { Row } from '@shared/db'
import { PropertyCell } from '@/components/properties/PropertyCell'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { fieldInfo, toggleColumn, type FieldKind } from '@/lib/fields'
import { cn } from '@/lib/utils'
import { FieldIcon, GroupLabel, NewEntryRow, groupCtx, sections, type ViewProps } from './common'

const DEFAULT_WIDTH: Partial<Record<FieldKind, number>> = {
  title: 280,
  checkbox: 90,
  number: 110,
  count: 100,
  overdue: 90,
  progress: 140,
  date: 170,
  relation: 200,
  multi_select: 200,
  text: 200
}

/** 列宽只影响显示，存在本机，不写进 schema */
function useColumnSizing(key: string): [ColumnSizingState, (s: ColumnSizingState) => void] {
  const read = (): ColumnSizingState => {
    try {
      return JSON.parse(localStorage.getItem(key) ?? '{}') as ColumnSizingState
    } catch {
      return {}
    }
  }
  const [sizing, setSizing] = useState<ColumnSizingState>(read)
  // 切换视图时换成那个视图的列宽
  useEffect(() => setSizing(read()), [key])
  const save = (s: ColumnSizingState): void => {
    setSizing(s)
    try {
      localStorage.setItem(key, JSON.stringify(s))
    } catch {
      // 存不了就只在这次会话里生效
    }
  }
  return [sizing, save]
}

export function TableView(props: ViewProps) {
  const { schema, view, data, columns, onPatch, onRename, onOpen, onCreate, suggestions } = props
  const [sizing, setSizing] = useColumnSizing(`sb:col-widths:${schema.id}:${view.name}`)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const columnDefs = useMemo<ColumnDef<Row>[]>(
    () =>
      columns.map((key) => {
        const kind = fieldInfo(schema, key)?.kind ?? 'text'
        return { id: key, size: DEFAULT_WIDTH[kind] ?? 150, minSize: 60, maxSize: 800 }
      }),
    [schema, columns]
  )

  const table = useReactTable({
    data: data.rows,
    columns: columnDefs,
    getRowId: (r) => r.path,
    getCoreRowModel: getCoreRowModel(),
    columnResizeMode: 'onChange',
    state: { columnSizing: sizing },
    onColumnSizingChange: (updater) => setSizing(typeof updater === 'function' ? updater(sizing) : updater)
  })

  const headers = table.getHeaderGroups()[0]!.headers
  const width = table.getTotalSize()
  const parts = sections(data)

  const toggle = (key: string): void =>
    setCollapsed((c) => {
      const next = new Set(c)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  return (
    <div className="overflow-x-auto pb-6">
      <table className="table-fixed border-collapse text-[13px]" style={{ width: width + 40 }}>
        <colgroup>
          {headers.map((h) => (
            <col key={h.id} style={{ width: h.getSize() }} />
          ))}
          <col style={{ width: 40 }} />
        </colgroup>
        <thead>
          <tr>
            {headers.map((h) => (
              <HeaderCell key={h.id} header={h} {...props} />
            ))}
            <th className="border-b" />
          </tr>
        </thead>
        {parts.map((part) => {
          const groupKey = part.key === undefined ? '' : String(part.key)
          const isCollapsed = part.key !== undefined && collapsed.has(groupKey)
          return (
            <tbody key={groupKey}>
              {part.key !== undefined && (
                <tr>
                  <td colSpan={headers.length + 1} className="pt-5 pb-1">
                    <button
                      type="button"
                      onClick={() => toggle(groupKey)}
                      className="sticky left-0 flex h-7 items-center gap-1.5 rounded px-1 hover:bg-hover"
                    >
                      {isCollapsed ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
                      <GroupLabel schema={schema} field={view.group!} groupKey={part.key} />
                      <span className="ml-1 text-muted-foreground tabular-nums">{part.rows.length}</span>
                    </button>
                  </td>
                </tr>
              )}
              {!isCollapsed &&
                part.rows.map((row) => (
                  <tr key={row.path} className="group/row">
                    {columns.map((key) => (
                      <td key={key} className="relative border-r border-b p-0 group-hover/row:bg-hover/60 last-of-type:border-r-0">
                        <PropertyCell
                          schema={schema}
                          field={key}
                          row={row}
                          variant="table"
                          onCommit={(patch) => onPatch(row, patch)}
                          onRename={(t) => onRename(row, t)}
                          onOpenPage={onOpen}
                          suggestions={suggestions[key]}
                          className={key === 'name' ? 'pr-16' : undefined}
                        />
                        {key === 'name' && (
                          <button
                            type="button"
                            onClick={() => onOpen(row.path)}
                            className="absolute top-1.5 right-1.5 hidden h-6 items-center gap-1 rounded border bg-background px-1.5 text-[12px] text-muted-foreground shadow-sm group-hover/row:flex hover:text-foreground"
                          >
                            <Maximize2 className="size-3" />
                            打开
                          </button>
                        )}
                        {key === 'name' && row.error && (
                          <span className="absolute top-2 right-16 text-[11px] text-destructive" title={row.error}>
                            格式错误
                          </span>
                        )}
                      </td>
                    ))}
                    <td className="border-b group-hover/row:bg-hover/60" />
                  </tr>
                ))}
              {!isCollapsed && (
                <tr>
                  <td colSpan={headers.length + 1} className="border-b py-0.5">
                    <NewEntryRow onCreate={onCreate} ctx={groupCtx(view, part.key)} className="sticky left-0 w-80" />
                  </td>
                </tr>
              )}
            </tbody>
          )
        })}
      </table>
      {data.rows.length === 0 && !data.groups && (
        <p className="px-2 py-6 text-[13px] text-muted-foreground">这个视图里还没有条目。</p>
      )}
    </div>
  )
}

function HeaderCell({ header, schema, view, onViewChange }: ViewProps & { header: Header<Row, unknown> }) {
  const key = header.column.id
  const info = fieldInfo(schema, key)
  const sortBy = (desc: boolean): void => {
    const rest = (view.sort ?? []).filter((s) => s.replace(/^-/, '') !== key)
    onViewChange({ ...view, sort: [desc ? `-${key}` : key, ...rest] })
  }
  return (
    <th className="relative border-r border-b p-0 text-left font-normal text-muted-foreground last-of-type:border-r-0">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="flex h-8 w-full min-w-0 items-center gap-1.5 px-2 hover:bg-hover">
            {info && <FieldIcon kind={info.kind} />}
            <span className="truncate">{info?.label ?? key}</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={() => sortBy(false)}>
            <ArrowUpNarrowWide />
            升序排列
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => sortBy(true)}>
            <ArrowDownWideNarrow />
            降序排列
          </DropdownMenuItem>
          {key !== 'name' && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => onViewChange(toggleColumn(schema, view, key))}>
                <EyeOff />
                隐藏这一列
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <div
        onMouseDown={header.getResizeHandler()}
        onDoubleClick={() => header.column.resetSize()}
        className={cn(
          'absolute top-0 -right-1 z-10 h-full w-2 cursor-col-resize select-none',
          'after:absolute after:inset-y-0 after:left-1/2 after:w-0.5 after:-translate-x-1/2 hover:after:bg-ring/60',
          header.column.getIsResizing() && 'after:bg-ring'
        )}
        role="separator"
        aria-label="调整列宽"
      />
    </th>
  )
}
