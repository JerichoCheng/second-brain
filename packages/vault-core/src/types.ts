// ---------------------------------------------------------------- schema

export type FieldType =
  | "text"
  | "number"
  | "checkbox"
  | "select"
  | "multi_select"
  | "status"
  | "date"
  | "relation"
  | "url"
  | "recurrence";

export interface FieldDef {
  type: FieldType;
  /** select / multi_select / status 的可选值。空数组表示不限制（自由填写）。 */
  options?: string[];
  /** status：哪些值算「已完成」，默认 ["done"]。 */
  complete?: string[];
  /** 新建条目时的默认值。 */
  default?: unknown;
  /** date：区间的开始字段名。写 true 等同于 "start"。 */
  range?: boolean | string;
  /** relation：目标数据库 id。 */
  to?: string;
  /** relation：是否允许多值。 */
  multiple?: boolean;
  /** 界面显示名，省略时用字段名。 */
  label?: string;
}

export type ComputedDef =
  | { fn: "overdue"; field: string; label?: string }
  | { fn: "progress"; from: string; via: string; label?: string }
  | { fn: "count"; from: string; via: string; label?: string };

export type FilterOp =
  | "is"
  | "is_not"
  | "contains"
  | "not_contains"
  | "is_empty"
  | "is_not_empty"
  | "before"
  | "after"
  | "on_or_before"
  | "on_or_after"
  | "within";

export type Condition = [field: string, op: FilterOp, value?: unknown];
/** 列表中各项为「与」；`{ any: [...] }` 内各项为「或」。 */
export type FilterItem = Condition | { any: FilterItem[] } | { all: FilterItem[] };

export type ViewType = "table" | "list" | "board" | "calendar" | "gallery";

export interface ViewDef {
  name: string;
  type: ViewType;
  filter?: FilterItem[];
  /** 字段名，前缀 `-` 表示降序。 */
  sort?: string[];
  group?: string;
  /** board：隐藏的分组；其他视图：隐藏的列。 */
  hide?: string[];
  /** table：显示的列及顺序。 */
  columns?: string[];
  /** calendar：日期字段。 */
  date?: string;
  /** gallery：封面字段。 */
  cover?: string;
  /** 默认会隐藏 archived: true 的条目，设为 true 则包含。 */
  include_archived?: boolean;
}

export interface Schema {
  id: string;
  name: string;
  folder: string;
  icon?: string;
  template?: string;
  fields: Record<string, FieldDef>;
  computed: Record<string, ComputedDef>;
  views: ViewDef[];
}

// ---------------------------------------------------------------- 条目

export interface Entry {
  /** 相对 vault 根目录的路径，统一用 `/` 分隔。 */
  path: string;
  /** 文件名（不含 .md），即标题，全库唯一。 */
  name: string;
  /** 所属数据库 id；不属于任何数据库时为 null。 */
  db: string | null;
  /** 原始 frontmatter（YAML 解析结果，未按 schema 转换）。 */
  data: Record<string, unknown>;
  body: string;
  /** 文件原文，用来判断监听到的变化是不是自己写的。 */
  raw: string;
  mtimeMs: number;
  /** frontmatter 中每个字段指向的页面名。 */
  fieldLinks: Record<string, string[]>;
  /** 正文中的 wikilink 指向的页面名（不含代码块）。 */
  bodyLinks: string[];
  /** frontmatter 解析失败时的错误信息；此时 data 为空。 */
  error?: string;
}

// ---------------------------------------------------------------- 查询

export interface QueryContext {
  /** 今天，YYYY-MM-DD，按本地时区。省略时取当前日期。 */
  today?: string;
  /** 当前时刻，用于带时间的截止日期。 */
  now?: Date;
  /** 一周从哪天开始：0 = 周日，1 = 周一（默认）。 */
  weekStart?: 0 | 1;
  /** 嵌入视图所在页面的名字，过滤值写 `$this` 时替换成它。 */
  self?: string;
}

export interface Group {
  key: string | null;
  entries: Entry[];
}

export interface QueryResult {
  entries: Entry[];
  groups?: Group[];
}

export type VaultEvent =
  | { type: "add" | "change"; path: string; entry: Entry }
  | { type: "unlink"; path: string }
  | { type: "schema" };
