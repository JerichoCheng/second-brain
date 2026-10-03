import { useState } from 'react'
import { ChevronDown, ChevronRight, FileText } from 'lucide-react'
import { statusInfo } from '@/lib/fields'
import { cn } from '@/lib/utils'
import { CardProperties, GroupLabel, NewEntryRow, StatusToggle, groupCtx, sections, type ViewProps } from './common'

/** 列表：一行一个条目，右侧显示有值的属性；有分组时按组折叠 */
export function ListView(props: ViewProps) {
  const { schema, view, data, columns, onOpen, onPatch, onCreate } = props
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const parts = sections(data)

  return (
    <div className="pb-6">
      {parts.map((part) => {
        const key = part.key === undefined ? '' : String(part.key)
        const isCollapsed = part.key !== undefined && collapsed.has(key)
        return (
          <section key={key} className={cn(part.key !== undefined && 'mt-4 first:mt-0')}>
            {part.key !== undefined && (
              <button
                type="button"
                className="mb-1 flex h-7 items-center gap-1.5 rounded px-1 hover:bg-hover"
                onClick={() =>
                  setCollapsed((c) => {
                    const next = new Set(c)
                    if (next.has(key)) next.delete(key)
                    else next.add(key)
                    return next
                  })
                }
              >
                {isCollapsed ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
                <GroupLabel schema={schema} field={view.group!} groupKey={part.key} />
                <span className="ml-1 text-[13px] text-muted-foreground tabular-nums">{part.rows.length}</span>
              </button>
            )}
            {!isCollapsed && (
              <ul className="border-t">
                {part.rows.map((row) => (
                  <li
                    key={row.path}
                    onClick={() => onOpen(row.path)}
                    className="flex min-h-9 cursor-default items-center gap-2 border-b px-2 py-1 hover:bg-hover/60"
                  >
                    <StatusToggle schema={schema} row={row} onPatch={onPatch} />
                    {!statusInfo(schema) && <FileText className="size-4 shrink-0 text-muted-foreground" />}
                    <span className="min-w-0 shrink truncate font-medium">{row.name}</span>
                    {row.error && <span className="text-[12px] text-destructive">格式错误</span>}
                    <CardProperties
                      schema={schema}
                      row={row}
                      columns={columns}
                      onOpen={onOpen}
                      className="ml-auto shrink-0 flex-nowrap justify-end text-muted-foreground"
                    />
                  </li>
                ))}
                <li>
                  <NewEntryRow onCreate={onCreate} ctx={groupCtx(view, part.key)} className="my-0.5" />
                </li>
              </ul>
            )}
          </section>
        )
      })}
    </div>
  )
}
