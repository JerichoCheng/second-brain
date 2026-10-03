import { useEffect, useState } from 'react'
import { ExternalLink, Trash2, X } from 'lucide-react'
import type { EntryDetail } from '@shared/db'
import { PropertyCell } from '@/components/properties/PropertyCell'
import { Button } from '@/components/ui/button'
import { FieldIcon } from '@/components/views/common'
import { useToast } from '@/hooks/toast'
import { useVaultData } from '@/hooks/vault-data'
import { api, errorMessage } from '@/lib/api'
import { allFields, patchToValues } from '@/lib/fields'

interface Props {
  /** 条目的路径或页面名 */
  target: string
  onClose: () => void
  /** 改名、点开关联页面后，面板显示的条目变了 */
  onTarget: (target: string) => void
}

/** 右侧的页面面板：标题、全部属性（可编辑）、正文预览。正文编辑器在阶段 3 加入 */
export function EntryPanel({ target, onClose, onTarget }: Props) {
  const { version, getSchema } = useVaultData()
  const toast = useToast()
  const [detail, setDetail] = useState<EntryDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    api.entry.get(target).then(
      (d) => {
        if (!alive) return
        setDetail(d)
        setError(null)
      },
      (err) => alive && setError(errorMessage(err))
    )
    return () => {
      alive = false
    }
  }, [target, version])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !document.querySelector('[data-radix-popper-content-wrapper]')) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const schema = detail?.db ? getSchema(detail.db) : undefined
  const row = detail?.row

  const patch = (p: Record<string, unknown>): void => {
    if (!row) return
    if (schema) setDetail((d) => d && { ...d, row: { ...d.row, values: { ...d.row.values, ...patchToValues(schema, p) } } })
    api.entry.update(row.path, p).catch(toast.error)
  }

  const rename = (title: string): void => {
    if (!row) return
    api.entry.rename(row.path, title).then((r) => onTarget(r.path), toast.error)
  }

  const remove = (): void => {
    if (!row) return
    if (!window.confirm(`把「${row.name}」移到废纸篓（.brain/trash）？`)) return
    api.entry.remove(row.path).then(onClose, toast.error)
  }

  return (
    <aside className="flex h-full w-[min(30rem,45vw)] shrink-0 flex-col border-l bg-background" aria-label="页面">
      <div className="flex h-11 shrink-0 items-center gap-1 border-b px-2">
        <Button variant="ghost" size="icon" className="size-7" onClick={onClose} aria-label="关闭">
          <X />
        </Button>
        {schema && <span className="truncate text-[13px] text-muted-foreground">{schema.icon} {schema.name}</span>}
        <span className="flex-1" />
        {row && (
          <>
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => api.entry.openExternal(row.path).catch(toast.error)}>
              <ExternalLink />
              用默认编辑器打开
            </Button>
            <Button variant="ghost" size="icon" className="size-7 text-muted-foreground" onClick={remove} aria-label="删除">
              <Trash2 />
            </Button>
          </>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-6 pb-10">
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
        {row && (
          <>
            {schema ? (
              <PropertyCell
                schema={schema}
                field="name"
                row={row}
                variant="panel"
                onCommit={() => {}}
                onRename={rename}
                className="-mx-2 text-2xl leading-tight font-bold [&_input]:font-bold"
              />
            ) : (
              <h2 className="text-2xl leading-tight font-bold">{row.name}</h2>
            )}
            {row.error && (
              <p className="mt-2 rounded-md bg-warning-surface px-3 py-2 text-[13px] text-warning">
                frontmatter 格式有误，修好之前不能在这里修改：{row.error}
              </p>
            )}

            {schema && (
              <dl className="mt-4 space-y-px">
                {allFields(schema)
                  .filter((f) => f.key !== 'name')
                  .map((f) => (
                    <div key={f.key} className="grid grid-cols-[8.5rem_1fr] items-start gap-2">
                      <dt className="flex h-8 items-center gap-1.5 truncate text-[13px] text-muted-foreground">
                        <FieldIcon kind={f.kind} />
                        <span className="truncate">{f.label}</span>
                      </dt>
                      <dd className="min-w-0 text-[13px]">
                        <PropertyCell
                          schema={schema}
                          field={f.key}
                          row={row}
                          variant="panel"
                          onCommit={patch}
                          onOpenPage={onTarget}
                        />
                      </dd>
                    </div>
                  ))}
              </dl>
            )}

            <div className="mt-6 border-t pt-4">
              {detail.body.trim() ? (
                <pre className="font-sans text-[14px] leading-relaxed break-words whitespace-pre-wrap">{detail.body}</pre>
              ) : (
                <p className="text-[13px] text-muted-foreground">没有正文。</p>
              )}
              <p className="mt-4 text-[12px] text-muted-foreground">正文暂时只读，可以用默认编辑器修改，保存后这里会自动更新。</p>
            </div>
          </>
        )}
      </div>
    </aside>
  )
}
