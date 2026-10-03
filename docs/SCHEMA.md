# Schema 格式规范

每个数据库对应 `vault/.brain/schema/<id>.yaml`。文件名（去掉扩展名）即数据库 id。

> 草案，阶段 1 实现时可能调整。

## 示例

```yaml
name: Tasks
folder: tasks
icon: ✅
template: templates/任务.md      # 可选，新建条目时使用

fields:
  status:   { type: status, options: [inbox, next, doing, waiting, someday, done], default: inbox }
  priority: { type: select, options: [high, medium, low], default: medium }
  due:      { type: date, range: true }
  project:  { type: relation, to: projects }
  parent:   { type: relation, to: tasks }
  people:   { type: relation, to: people, multiple: true }
  my_day:   { type: checkbox }
  recur:    { type: recurrence }
  labels:   { type: multi_select, options: [] }

computed:
  overdue: { type: formula, fn: overdue, args: [due, status] }

views:
  - name: Today
    type: list
    filter:
      - [due, on_or_before, today]
      - [status, is_not, done]
    sort: [priority, due]

  - name: Next 7 Days
    type: list
    filter:
      - [due, within, next_7_days]
      - [status, is_not, done]
    group: due

  - name: 按项目
    type: table
    filter: [[status, is_not, done]]
    group: project

  - name: 看板
    type: board
    group: status
    hide: [done]

  - name: 日历
    type: calendar
    date: due
```

## 字段类型

| type | 存储形式 | 说明 |
|---|---|---|
| `text` | 字符串 | |
| `number` | 数字 | |
| `checkbox` | `true` / 省略 | `false` 不写入文件 |
| `select` | 字符串 | 值必须在 `options` 中 |
| `multi_select` | 字符串列表 | |
| `status` | 字符串 | 同 select，但看板默认按它分组，且 `done` 视为完成 |
| `date` | `YYYY-MM-DD` / `YYYY-MM-DDTHH:mm` | `range: true` 时另有 `start` 字段 |
| `relation` | `"[[页面名]]"` 或其列表 | `to` 指向目标数据库 id；`multiple: true` 允许多值 |
| `url` | 字符串 | |
| `recurrence` | 如 `1 week`、`2 day` | 可配合 `recur_days: [Monday]` |

## 过滤

每个条件是 `[字段, 操作符, 值]`，多个条件之间为「与」。

| 操作符 | 适用类型 |
|---|---|
| `is` / `is_not` | 所有 |
| `contains` / `not_contains` | text、multi_select、relation |
| `is_empty` / `is_not_empty` | 所有（不需要值） |
| `before` / `after` / `on_or_before` / `on_or_after` | date、number |
| `within` | date，值为 `this_week`、`next_7_days`、`this_month`、`this_quarter` |

日期值可用相对写法：`today`、`tomorrow`、`yesterday`。

## 视图类型

| type | 必需参数 | 说明 |
|---|---|---|
| `table` | — | `columns` 指定显示的列及顺序 |
| `list` | — | |
| `board` | `group` | 分组字段须为 select 或 status |
| `calendar` | `date` | |
| `gallery` | — | `cover` 指定封面图片字段 |

所有视图都支持 `filter`、`sort`、`group`（board 除外，其 group 即分列）、`hide`。

## 计算字段

只实现明确用到的函数，不做通用公式引擎：

| fn | 说明 |
|---|---|
| `overdue` | 截止日期已过且未完成 |
| `progress` | 关联条目中已完成的比例（如项目下任务的完成率） |
| `count` | 反向关联的条目数 |
