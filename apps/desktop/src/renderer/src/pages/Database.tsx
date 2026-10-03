import { useCallback, useEffect, useMemo, useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import type { Row, Schema, ViewDef, ViewType } from '@shared/db'
import { EntryPanel } from '@/components/EntryPanel'
import { BoardView } from '@/components/views/BoardView'
import { CalendarView } from '@/components/views/CalendarView'
import type { ViewProps } from '@/components/views/common'
import { GalleryView } from '@/components/views/GalleryView'
import { ListView } from '@/components/views/ListView'
import { TableView } from '@/components/views/TableView'
import { DirtyBar, ViewTabs, ViewTools } from '@/components/views/ViewToolbar'
import { useToast } from '@/hooks/toast'
import { useVaultData, useViewQuery } from '@/hooks/vault-data'
import { api } from '@/lib/api'
import { patchToValues, visibleColumns } from '@/lib/fields'
import {
  VIEW_TYPE_LABELS,
  defaultsFromView,
  newView,
  sameView,
  uniqueViewName,
  viewProblem,
  type CreateContext
} from '@/lib/view-logic'

const VIEWS: Record<ViewType, (props: ViewProps) => React.ReactNode> = {
  table: TableView,
  board: BoardView,
  calendar: CalendarView,
  list: ListView,
  gallery: GalleryView
}

/** 记住每个数据库上次打开的视图（只存在本机） */
function useRememberedView(db: string): [string | null, (name: string) => void] {
  const key = `sb:view:${db}`
  const read = (): string | null => {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  }
  const [name, setName] = useState(read)
  useEffect(() => setName(read()), [key]) // 切换数据库
  const remember = useCallback(
    (n: string) => {
      setName(n)
      try {
        localStorage.setItem(key, n)
      } catch {
        // 记不住也没关系
      }
    },
    [key]
  )
  return [name, remember]
}

export function DatabasePage({ db }: { db: string }) {
  const { getSchema, schemaErrors, loadError } = useVaultData()
  const schema = getSchema(db)

  if (!schema) {
    return (
      <div className="px-12 pt-12 text-muted-foreground">
        {loadError ? <p className="text-destructive">{loadError}</p> : <p>正在加载…</p>}
      </div>
    )
  }
  return <DatabaseView key={db} schema={schema} errors={schemaErrors.filter((e) => e.startsWith(`${db}: `))} />
}

function DatabaseView({ schema, errors }: { schema: Schema; errors: string[] }) {
  const db = schema.id
  const toast = useToast()
  const { refresh } = useVaultData()

  const saved = useMemo<ViewDef[]>(
    () => (schema.views.length ? schema.views : [{ name: '全部', type: 'table' }]),
    [schema.views]
  )
  const [remembered, remember] = useRememberedView(db)
  const base = saved.find((v) => v.name === remembered) ?? saved[0]!
  // 临时修改（过滤、排序……），按视图名保存，切换视图后再回来还在
  const [drafts, setDrafts] = useState<Record<string, ViewDef>>({})
  const view = drafts[base.name] ?? base
  const dirtyNames = useMemo(
    () => new Set(Object.entries(drafts).filter(([n, d]) => {
      const s = saved.find((v) => v.name === n)
      return s && !sameView(s, d)
    }).map(([n]) => n)),
    [drafts, saved]
  )
  const dirty = dirtyNames.has(base.name) || !schema.views.length

  const problem = viewProblem(schema, view)
  const { data, error, patchLocal } = useViewQuery(db, problem ? null : view)
  const [panel, setPanel] = useState<string | null>(null)

  const setView = (v: ViewDef): void => setDrafts((d) => ({ ...d, [base.name]: v }))
  const dropDraft = (name: string): void =>
    setDrafts((d) => {
      const { [name]: _, ...rest } = d
      return rest
    })

  const saveView = async (v: ViewDef, replace?: string): Promise<boolean> => {
    try {
      await api.db.saveView(db, v, replace)
      return true
    } catch (err) {
      toast.error(err)
      return false
    }
  }

  // ------------------------------------------------ 条目操作

  const onPatch = (row: Row, patch: Record<string, unknown>): void => {
    patchLocal(row.path, patchToValues(schema, patch))
    api.entry.update(row.path, patch).catch((err) => {
      toast.error(err)
      refresh() // 恢复成文件里的值
    })
  }

  const onRename = (row: Row, title: string): void => {
    api.entry.rename(row.path, title).then((r) => {
      if (panel === row.path) setPanel(r.path)
    }, toast.error)
  }

  const onCreate = async (title: string, ctx: CreateContext): Promise<void> => {
    try {
      await api.entry.create(db, title, defaultsFromView(schema, view, ctx))
    } catch (err) {
      toast.error(err)
      throw err
    }
  }

  const suggestions = useMemo(() => {
    const out: Record<string, string[]> = {}
    for (const [k, f] of Object.entries(schema.fields)) {
      if (f.type !== 'multi_select' || f.options?.length) continue
      const seen = new Set<string>()
      for (const r of data?.rows ?? []) for (const v of (r.values[k] as string[] | null) ?? []) seen.add(v)
      out[k] = [...seen].sort()
    }
    return out
  }, [schema, data])

  // ------------------------------------------------ 视图操作

  const addView = async (type: ViewType): Promise<void> => {
    const v = newView(schema, type, uniqueViewName(schema, VIEW_TYPE_LABELS[type]))
    if (await saveView(v)) remember(v.name)
  }

  const renameView = async (from: string, to: string): Promise<void> => {
    const s = saved.find((v) => v.name === from)
    if (!s || !(await saveView({ ...s, name: to }, from))) return
    setDrafts((d) => {
      if (!d[from]) return d
      const { [from]: draft, ...rest } = d
      return { ...rest, [to]: { ...draft!, name: to } }
    })
    if (base.name === from) remember(to)
  }

  const Body = VIEWS[view.type] ?? TableView

  return (
    <div className="flex h-full min-w-0">
      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="px-12 pt-10">
          <h1 className="flex items-center gap-2 text-[28px] leading-tight font-bold tracking-tight">
            {schema.icon && <span aria-hidden>{schema.icon}</span>}
            {schema.name}
          </h1>

          {errors.length > 0 && (
            <div className="mt-3 flex items-start gap-2 rounded-md bg-warning-surface px-3 py-2 text-[13px] text-warning">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <div>
                <p>schema 文件有问题，部分视图可能不正常：</p>
                <ul className="mt-1 list-disc pl-4">
                  {errors.map((e) => (
                    <li key={e}>{e.slice(db.length + 2)}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          <div className="sticky top-0 z-20 mt-5 flex flex-wrap items-center gap-x-4 gap-y-1 border-b bg-background">
            <div className="min-w-0 flex-1">
              <ViewTabs
                views={saved}
                current={base.name}
                dirty={dirtyNames}
                onSelect={remember}
                onRename={(a, b) => void renameView(a, b)}
                onAdd={(t) => void addView(t)}
              />
            </div>
            <ViewTools
              schema={schema}
              view={view}
              onChange={setView}
              onDuplicate={async () => {
                const copy = { ...view, name: uniqueViewName(schema, `${base.name} 副本`) }
                if (await saveView(copy)) remember(copy.name)
              }}
              onDelete={async () => {
                if (!schema.views.some((v) => v.name === base.name)) return
                if (!window.confirm(`删除视图「${base.name}」？条目不会被删除。`)) return
                try {
                  await api.db.deleteView(db, base.name)
                  dropDraft(base.name)
                } catch (err) {
                  toast.error(err)
                }
              }}
            />
          </div>

          {dirty && (
            <div className="flex justify-end border-b py-1">
              <DirtyBar
                suggestName={uniqueViewName(schema, view.name)}
                onReset={() => dropDraft(base.name)}
                onSave={async () => {
                  const replace = schema.views.some((v) => v.name === base.name) ? base.name : undefined
                  if (await saveView(view, replace)) dropDraft(base.name)
                }}
                onSaveAs={async (name) => {
                  if (await saveView({ ...view, name })) {
                    dropDraft(base.name)
                    remember(name)
                  }
                }}
              />
            </div>
          )}

          <div className="pt-3">
            {problem && <p className="py-6 text-[13px] text-muted-foreground">{problem}</p>}
            {!problem && error && (
              <p role="alert" className="py-6 text-[13px] text-destructive">
                查询失败：{error}
              </p>
            )}
            {!problem && data && (
              <Body
                schema={schema}
                view={view}
                data={data}
                columns={visibleColumns(schema, view)}
                onPatch={onPatch}
                onRename={onRename}
                onOpen={setPanel}
                onCreate={onCreate}
                onViewChange={setView}
                suggestions={suggestions}
              />
            )}
          </div>
        </div>
      </div>
      {panel && <EntryPanel target={panel} onClose={() => setPanel(null)} onTarget={setPanel} />}
    </div>
  )
}
