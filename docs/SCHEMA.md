# Schema 格式规范

每个数据库对应 `vault/.brain/schema/<id>.yaml`，文件名（去掉扩展名）即数据库 id。
默认的 17 个 schema 在 `packages/vault-core/schemas/`，`initVault()` 会把缺少的复制进 vault，已有的不覆盖。

条目属于哪个数据库**由所在文件夹决定**（取最长匹配，子文件夹也算），不看 frontmatter 里的 `type`。

## 示例

```yaml
name: 任务
folder: tasks
icon: ✅
template: templates/任务.md      # 可选，新建条目时使用，支持 {{title}} {{date}}

fields:
  status:  { type: status, label: 状态, options: [inbox, next, doing, waiting, someday, done], default: inbox }
  due:     { type: date, label: 截止, range: start }
  project: { type: relation, label: 项目, to: projects }
  people:  { type: relation, to: people, multiple: true }
  my_day:  { type: checkbox }

computed:
  overdue:  { fn: overdue, field: due }
  subtasks: { fn: count, from: tasks, via: parent }

views:
  - name: Today
    type: list
    filter:
      - [status, is_not, done]
      - any: [[my_day, is, true], [due, on_or_before, today]]
    sort: [priority, due]
```

## 字段类型

| type | 存储形式 | 说明 |
|---|---|---|
| `text` | 字符串 | |
| `number` | 数字 | |
| `checkbox` | `true` / 省略 | `false` 不写入文件 |
| `select` | 字符串 | `options` 非空时，写入的值必须在其中 |
| `multi_select` | 字符串列表 | 同上；`options: []` 表示自由填写 |
| `status` | 字符串 | 同 select；`complete` 指定哪些值算完成（默认 `[done]`），用于逾期和进度 |
| `date` | `YYYY-MM-DD` / `YYYY-MM-DDTHH:mm` | `range: start` 表示区间的开始日期存在 `start` 字段（`range: true` 同义） |
| `relation` | `"[[页面名]]"` 或其列表 | `to` 为目标数据库 id；`multiple: true` 允许多值 |
| `url` | 字符串 | |
| `recurrence` | 如 `1 week`、`2 day` | 可配合 `recur_days` 使用（阶段 4 实现） |

所有字段可加 `label`（界面显示名）和 `default`（新建时的默认值）。

内置字段 `name`（标题）和 `mtime`（修改时间）可用于过滤、排序和 `columns`，不需要声明。

写入时会按类型校验和规整：`today` / `tomorrow` 会换成实际日期，关联值 `CITS2002` 会写成 `"[[CITS2002]]"`。schema 里没有声明的字段照常保留，不校验。

## 计算字段

只实现明确用到的函数，不做通用公式引擎。计算字段不写入文件，可以和普通字段一样用于过滤、排序和分组。

| fn | 参数 | 说明 |
|---|---|---|
| `overdue` | `field` | 日期已过且未完成。纯日期按天比较；带时间的按时刻比较 |
| `progress` | `from`, `via` | `from` 库中通过 `via` 字段关联到本条目的条目里，已完成的比例（0–1）；没有关联条目时为空 |
| `count` | `from`, `via` | 同上，关联条目的数量 |

`progress` 和 `count` 只统计关联字段，不统计正文里的链接。

## 过滤

每个条件是 `[字段, 操作符, 值]`。列表中的条件之间为「与」；`{ any: [...] }` 内为「或」，`{ all: [...] }` 内为「与」，可以嵌套。

| 操作符 | 适用类型 | 说明 |
|---|---|---|
| `is` / `is_not` | 所有 | 值可以是列表，表示「是其中之一」；对多值字段（multi_select、relation）等同于 contains |
| `contains` / `not_contains` | text、multi_select、relation | 文本不区分大小写 |
| `is_empty` / `is_not_empty` | 所有 | 不需要值；checkbox 未勾选算空 |
| `before` / `after` / `on_or_before` / `on_or_after` | date、number | 日期按天比较 |
| `within` | date | `this_week`、`next_week`、`last_7_days`、`next_7_days`、`this_month`、`this_quarter`、`this_year` |

- 日期值可用 `today`、`tomorrow`、`yesterday`。「今天」按本地时区计算，一周从周一开始。
- 关联值写 `X` 或 `"[[X]]"` 都可以，不区分大小写。
- 值写 `$this` 表示当前页面，用于嵌入视图（如项目页中的「该项目的任务」）。
- 数据库有 `archived` 字段时，归档条目默认不出现在视图中；过滤条件提到 `archived` 或视图设置 `include_archived: true` 时才显示。

## 排序

`sort` 是字段名列表，前缀 `-` 表示降序。select / status 按 `options` 中的顺序排（所以 `priority` 升序就是 high → low）。**空值总是排在最后**，不论升序降序。最后按标题排序，保证结果稳定。

## 分组

`group` 指定字段。select / status 按 `options` 顺序；日期按天，从早到晚；多值字段中，一个条目会出现在它每个值的分组里；没有值的条目归入最后的空分组（`key: null`）。

## 视图类型

| type | 必需参数 | 说明 |
|---|---|---|
| `table` | — | `columns` 指定显示的列及顺序 |
| `list` | — | |
| `board` | `group` | 分组字段须为 select 或 status。即使某列没有条目也会保留；`hide` 指定隐藏的列 |
| `calendar` | `date` | |
| `gallery` | — | `cover` 指定封面图片字段 |

所有视图都支持 `filter`、`sort`、`group`。`hide` 在 board 中表示隐藏的分组，在其他视图中表示隐藏的列。

## 校验

`validateSchemas()` 会检查：字段类型、关联目标库是否存在、默认值是否在选项中、计算字段的参数、视图引用的字段是否存在、看板分组字段类型、日历日期字段、`within` 的值。打开 vault 时结果放在 `vault.schemaErrors`。
