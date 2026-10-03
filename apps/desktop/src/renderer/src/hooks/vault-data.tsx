import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { QueryData, Row, Schema, Value, ViewDef } from '@shared/db'
import { api, errorMessage } from '@/lib/api'

interface VaultData {
  schemas: Schema[]
  schemaErrors: string[]
  /** schema 加载失败（比如 YAML 写坏了） */
  loadError: string | null
  getSchema: (id: string) => Schema | undefined
  /** vault 中有条目变化（外部编辑或界面修改）时递增，用来触发重新查询 */
  version: number
  /** 主动要求重新查询（比如修改失败后恢复界面） */
  refresh: () => void
}

const VaultDataContext = createContext<VaultData | null>(null)

export function useVaultData(): VaultData {
  const ctx = useContext(VaultDataContext)
  if (!ctx) throw new Error('useVaultData 必须在 VaultDataProvider 里使用')
  return ctx
}

/** 加载 schema，并订阅主进程推来的数据变化 */
export function VaultDataProvider({ children }: { children: React.ReactNode }) {
  const [schemas, setSchemas] = useState<Schema[]>([])
  const [schemaErrors, setSchemaErrors] = useState<string[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  const loadSchemas = useCallback(() => {
    api.db
      .schemas()
      .then((r) => {
        setSchemas(r.schemas)
        setSchemaErrors(r.errors)
        setLoadError(null)
      })
      .catch((err) => setLoadError(errorMessage(err)))
  }, [])

  useEffect(() => {
    loadSchemas()
    // 一次批量修改（重命名、git pull）会连续推来很多事件，合并成一次刷新
    let timer: ReturnType<typeof setTimeout> | undefined
    const bump = (): void => {
      clearTimeout(timer)
      timer = setTimeout(() => setVersion((v) => v + 1), 40)
    }
    const off = api.vault.onChange((change) => {
      if (change.kind === 'schema') loadSchemas()
      bump()
    })
    return () => {
      off()
      clearTimeout(timer)
    }
  }, [loadSchemas])

  const value = useMemo<VaultData>(
    () => ({
      schemas,
      schemaErrors,
      loadError,
      getSchema: (id) => schemas.find((s) => s.id === id),
      version,
      refresh: () => setVersion((v) => v + 1)
    }),
    [schemas, schemaErrors, loadError, version]
  )

  return <VaultDataContext.Provider value={value}>{children}</VaultDataContext.Provider>
}

export interface ViewQuery {
  data: QueryData | null
  error: string | null
  /** 乐观更新：先改界面上的值，等主进程推来变化后再以文件为准 */
  patchLocal: (path: string, values: Record<string, Value>) => void
}

/** 查询一个视图。视图定义、数据有变化时重新查询；重新查询期间保留旧结果，界面不闪 */
export function useViewQuery(db: string, view: ViewDef | null): ViewQuery {
  const { version } = useVaultData()
  const [data, setData] = useState<QueryData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const key = view ? JSON.stringify(view) : null
  const latest = useRef(0)

  useEffect(() => {
    if (!key) return
    const id = ++latest.current
    api.db
      .query(db, JSON.parse(key) as ViewDef)
      .then((d) => {
        if (id !== latest.current) return
        setData(d)
        setError(null)
      })
      .catch((err) => {
        if (id === latest.current) setError(errorMessage(err))
      })
  }, [db, key, version])

  // 切换数据库时清掉上一个库的结果
  useEffect(() => setData(null), [db])

  const patchLocal = useCallback((path: string, values: Record<string, Value>) => {
    setData((d) =>
      d
        ? {
            ...d,
            rows: d.rows.map((r: Row) => (r.path === path ? { ...r, values: { ...r.values, ...values } } : r))
          }
        : d
    )
  }, [])

  return { data, error, patchLocal }
}
