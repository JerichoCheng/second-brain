import { useState } from 'react'
import type { Row } from '@shared/db'
import { cn } from '@/lib/utils'
import { CardProperties, GroupLabel, NewEntryRow, groupCtx, sections, type ViewProps } from './common'

/** 画廊：卡片网格，cover 指定的字段是图片链接时显示为封面 */
export function GalleryView(props: ViewProps) {
  const { schema, view, data, onCreate } = props
  const parts = sections(data)

  return (
    <div className="space-y-6 pb-6">
      {parts.map((part) => (
        <section key={String(part.key)}>
          {part.key !== undefined && (
            <h3 className="mb-2 flex h-7 items-center gap-2 px-1">
              <GroupLabel schema={schema} field={view.group!} groupKey={part.key} />
              <span className="text-[13px] text-muted-foreground tabular-nums">{part.rows.length}</span>
            </h3>
          )}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
            {part.rows.map((row) => (
              <Card key={row.path} row={row} {...props} />
            ))}
            <div className="flex min-h-24 items-start rounded-lg border border-dashed p-1">
              <NewEntryRow onCreate={onCreate} ctx={groupCtx(view, part.key)} />
            </div>
          </div>
        </section>
      ))}
    </div>
  )
}

function Card({ row, schema, view, columns, onOpen }: ViewProps & { row: Row }) {
  const cover = view.cover ? row.values[view.cover] : null
  const src = typeof cover === 'string' && /^https?:\/\//.test(cover) ? cover : null
  const [broken, setBroken] = useState(false)

  return (
    <article
      onClick={() => onOpen(row.path)}
      className="flex cursor-default flex-col overflow-hidden rounded-lg border bg-background shadow-xs hover:bg-hover/50"
    >
      {view.cover && (
        <div className="flex h-36 items-center justify-center overflow-hidden border-b bg-muted">
          {src && !broken ? (
            <img src={src} alt="" className="size-full object-cover" onError={() => setBroken(true)} draggable={false} />
          ) : (
            <span className="text-3xl font-semibold text-muted-foreground/40">{row.name.slice(0, 1)}</span>
          )}
        </div>
      )}
      <div className={cn('flex flex-col gap-1.5 p-2.5')}>
        <span className="font-medium break-words">{row.name}</span>
        <CardProperties schema={schema} row={row} columns={columns.filter((c) => c !== view.cover)} onOpen={onOpen} />
      </div>
    </article>
  )
}
