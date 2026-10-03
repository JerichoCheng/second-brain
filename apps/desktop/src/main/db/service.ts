import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import {
  Vault,
  VaultError,
  completeValues,
  initVault as initSchemas,
  rangeStartField,
  statusField,
  type Entry,
  type Schema,
  type ViewDef
} from '@second-brain/vault-core'
import type { EntryDetail, QueryData, Row, SchemaList, Value, VaultChange } from '@shared/db'
import { BrainError } from '@shared/errors'

/**
 * vault-core 自带的默认 schema 所在目录。
 * vault-core 被打包进主进程后，它自己用 import.meta.url 算出的路径不再正确，所以在这里按包名解析。
 */
export function schemaSourceDir(): string {
  const require = createRequire(import.meta.url)
  return dirname(require.resolve('@second-brain/vault-core/schemas/tasks.yaml'))
}

/** 把缺少的默认 schema 复制进 vault，返回复制的文件（相对 vault 根目录） */
export async function ensureSchemas(root: string): Promise<string[]> {
  const { copiedSchemas } = await initSchemas(root, { schemaSource: schemaSourceDir() })
  return copiedSchemas.map((f) => `.brain/schema/${f}`)
}

/** 一行的全部字段值：普通字段、区间开始字段、计算字段，以及内置的 mtime */
export function toRow(vault: Vault, e: Entry): Row {
  const values: Record<string, Value> = { mtime: e.mtimeMs }
  const schema = e.db ? vault.schemas.get(e.db) : undefined
  if (schema) {
    for (const [k, def] of Object.entries(schema.fields)) {
      values[k] = vault.value(e, k)
      const start = rangeStartField(def)
      if (start) values[start] = vault.value(e, start)
    }
    for (const k of Object.keys(schema.computed)) values[k] = vault.value(e, k)
  }
  return { path: e.path, name: e.name, values, ...(e.error ? { error: e.error } : {}) }
}

/**
 * 状态改成「完成」时自动填完成日期，改回未完成时清空。
 * 只在数据库有名为 completed 的日期字段、且这次修改没有显式设置它时生效。
 */
export function withCompletion(
  schema: Schema,
  current: Record<string, unknown>,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const status = statusField(schema)
  if (!status || !(status[0] in patch)) return patch
  if (schema.fields.completed?.type !== 'date' || 'completed' in patch) return patch
  const done = completeValues(status[1])
  const was = done.includes(String(current[status[0]] ?? ''))
  const now = done.includes(String(patch[status[0]] ?? ''))
  if (now && !was) return { ...patch, completed: 'today' }
  if (!now && was) return { ...patch, completed: null }
  return patch
}

// ---------------------------------------------------------------- 参数校验

const VIEW_TYPES = ['table', 'list', 'board', 'calendar', 'gallery']

function text(value: unknown, what: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new BrainError('INVALID_ARGUMENT', `${what}不能为空`)
  return value
}

function record(value: unknown, what: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BrainError('INVALID_ARGUMENT', `${what}格式不对`)
  }
  return value as Record<string, unknown>
}

function strings(value: unknown, what: string): string[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
    throw new BrainError('INVALID_ARGUMENT', `${what}应为字符串列表`)
  }
  return value
}

function optionalText(value: unknown, what: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string') throw new BrainError('INVALID_ARGUMENT', `${what}应为字符串`)
  return value
}

/** 界面传来的视图定义：只保留认识的键，类型不对就拒绝 */
export function sanitizeView(value: unknown): ViewDef {
  const v = record(value, '视图')
  const type = String(v.type)
  if (!VIEW_TYPES.includes(type)) throw new BrainError('INVALID_ARGUMENT', `视图类型 ${type} 无效`)
  if (v.filter !== undefined && !Array.isArray(v.filter)) throw new BrainError('INVALID_ARGUMENT', '过滤条件应为列表')
  const view: ViewDef = { name: text(v.name, '视图名'), type: type as ViewDef['type'] }
  if (v.filter) view.filter = v.filter as ViewDef['filter']
  const sort = strings(v.sort, 'sort')
  const hide = strings(v.hide, 'hide')
  const columns = strings(v.columns, 'columns')
  if (sort) view.sort = sort
  if (hide) view.hide = hide
  if (columns) view.columns = columns
  const group = optionalText(v.group, 'group')
  const date = optionalText(v.date, 'date')
  const cover = optionalText(v.cover, 'cover')
  if (group) view.group = group
  if (date) view.date = date
  if (cover) view.cover = cover
  if (v.include_archived === true) view.include_archived = true
  return view
}

// ---------------------------------------------------------------- 服务

/**
 * 主进程持有的当前 vault：第一次用到时打开并开始监听，切换 vault 时关闭旧的。
 * 不依赖 Electron，变化通过 notify 回调推出去。
 */
export class DbService {
  private root: string | null = null
  private opening: Promise<Vault> | null = null

  constructor(
    private readonly vaultPath: () => Promise<string | null>,
    private readonly notify: (change: VaultChange) => void
  ) {}

  private async vault(): Promise<Vault> {
    const root = await this.vaultPath()
    if (!root) throw new BrainError('NO_VAULT', '还没有选择知识库')
    if (this.opening && this.root === root) return this.opening
    await this.close()
    this.root = root
    this.opening = this.open(root)
    this.opening.catch(() => {
      // 打开失败（比如 schema 写坏了）时下次重试
      if (this.root === root) {
        this.root = null
        this.opening = null
      }
    })
    return this.opening
  }

  private async open(root: string): Promise<Vault> {
    await ensureSchemas(root)
    const vault = await Vault.open(root)
    vault.on('event', (e) => {
      this.notify(e.type === 'schema' ? { kind: 'schema' } : { kind: 'entries', paths: [e.path] })
    })
    await vault.watch()
    return vault
  }

  async close(): Promise<void> {
    const opening = this.opening
    this.root = null
    this.opening = null
    if (opening) await opening.then((v) => v.close()).catch(() => {})
  }

  /** 把 vault-core 的错误换成界面能显示的 BrainError */
  private async run<T>(fn: (vault: Vault) => T | Promise<T>): Promise<T> {
    const vault = await this.vault()
    try {
      return await fn(vault)
    } catch (err) {
      if (err instanceof VaultError) throw new BrainError('VAULT', err.message)
      throw err
    }
  }

  private entry(vault: Vault, path: unknown): Entry {
    const e = vault.get(text(path, '路径'))
    if (!e) throw new BrainError('VAULT', `找不到页面 ${String(path)}`)
    return e
  }

  schemas(): Promise<SchemaList> {
    return this.run((v) => ({ schemas: [...v.schemas.values()], errors: v.schemaErrors }))
  }

  query(db: unknown, view: unknown): Promise<QueryData> {
    return this.run((v) => {
      const result = v.query(text(db, '数据库'), sanitizeView(view))
      return {
        rows: result.entries.map((e) => toRow(v, e)),
        ...(result.groups
          ? { groups: result.groups.map((g) => ({ key: g.key, paths: g.entries.map((e) => e.path) })) }
          : {})
      }
    })
  }

  /** 数据库里全部条目的名字，给关联字段的选择框用 */
  names(db: unknown): Promise<string[]> {
    return this.run((v) => {
      const id = text(db, '数据库')
      v.schemaOf(id)
      return v
        .entriesOf(id)
        .map((e) => e.name)
        .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
    })
  }

  get(path: unknown): Promise<EntryDetail> {
    return this.run((v) => {
      const e = this.entry(v, path)
      return { row: toRow(v, e), db: e.db, body: e.body }
    })
  }

  /** 条目文件的绝对路径（用默认编辑器打开时用） */
  absolutePath(path: unknown): Promise<string> {
    return this.run((v) => join(v.root, ...this.entry(v, path).path.split('/')))
  }

  create(db: unknown, title: unknown, fields: unknown): Promise<Row> {
    return this.run(async (v) => {
      const e = await v.create(text(db, '数据库'), text(title, '标题'), {
        fields: fields === undefined ? {} : record(fields, '字段'),
        onConflict: 'suffix'
      })
      this.notify({ kind: 'entries', paths: [e.path] })
      return toRow(v, e)
    })
  }

  update(path: unknown, patch: unknown): Promise<Row> {
    return this.run(async (v) => {
      const e = this.entry(v, path)
      let p = record(patch, '修改')
      if (e.db) p = withCompletion(v.schemaOf(e.db), e.data, p)
      const next = await v.update(e.path, p)
      this.notify({ kind: 'entries', paths: [next.path] })
      return toRow(v, next)
    })
  }

  rename(path: unknown, title: unknown): Promise<Row> {
    return this.run(async (v) => {
      const e = this.entry(v, path)
      const { entry, updated } = await v.rename(e.path, text(title, '标题'))
      this.notify({ kind: 'entries', paths: [e.path, entry.path, ...updated] })
      return toRow(v, entry)
    })
  }

  remove(path: unknown): Promise<void> {
    return this.run(async (v) => {
      const e = this.entry(v, path)
      await v.remove(e.path)
      this.notify({ kind: 'entries', paths: [e.path] })
    })
  }

  saveView(db: unknown, view: unknown, replace?: unknown): Promise<Schema> {
    return this.run(async (v) => {
      const schema = await v.saveView(text(db, '数据库'), sanitizeView(view), optionalText(replace, '原视图名'))
      this.notify({ kind: 'schema' })
      return schema
    })
  }

  deleteView(db: unknown, name: unknown): Promise<Schema> {
    return this.run(async (v) => {
      const schema = await v.deleteView(text(db, '数据库'), text(name, '视图名'))
      this.notify({ kind: 'schema' })
      return schema
    })
  }
}
