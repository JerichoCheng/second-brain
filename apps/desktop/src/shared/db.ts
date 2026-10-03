/**
 * 数据库视图相关的类型：主进程查询 vault-core 后，把结果整理成这些结构发给界面。
 * schema 的类型直接沿用 vault-core（只引用类型，界面不会打包 vault-core 的代码）。
 */
import type {
  ComputedDef,
  Condition,
  FieldDef,
  FieldType,
  FilterItem,
  FilterOp,
  Schema,
  ViewDef,
  ViewType
} from '@second-brain/vault-core/types'

export type { ComputedDef, Condition, FieldDef, FieldType, FilterItem, FilterOp, Schema, ViewDef, ViewType }

/** 字段值（已按类型规整）：日期是 YYYY-MM-DD 字符串，关联是页面名列表 */
export type Value = string | number | boolean | string[] | null

/** 视图中的一行 */
export interface Row {
  /** 相对 vault 根目录的路径，也是行的唯一标识 */
  path: string
  name: string
  /** schema 中每个字段、区间开始字段和计算字段的值，外加内置的 mtime */
  values: Record<string, Value>
  /** frontmatter 写坏了：可以看，但不能改 */
  error?: string
}

export interface QueryData {
  rows: Row[]
  /** 视图有 group 时才有。多值字段中一行会出现在多个分组里 */
  groups?: Array<{ key: string | null; paths: string[] }>
}

export interface EntryDetail {
  row: Row
  db: string | null
  body: string
}

export interface SchemaList {
  schemas: Schema[]
  /** schema 自洽性检查发现的问题 */
  errors: string[]
}

/** 主进程推给界面的数据变化（外部编辑、界面自己的修改都会推） */
export type VaultChange = { kind: 'entries'; paths: string[] } | { kind: 'schema' }
