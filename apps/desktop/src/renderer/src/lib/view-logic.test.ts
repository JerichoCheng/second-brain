import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseSchema } from '@second-brain/vault-core'
import { describe, expect, it } from 'vitest'
import { schemaSourceDir } from '../../../main/db/service'
import { addDays, dayDiff, formatDate, monthGrid, shiftDate } from './dates'
import { fieldInfo, tagColor, toggleColumn, visibleColumns } from './fields'
import { countConditions, defaultsFromView, newView, opsFor, sameView, uniqueViewName, viewProblem } from './view-logic'

const load = (id: string) => parseSchema(id, readFileSync(join(schemaSourceDir(), `${id}.yaml`), 'utf8'))
const tasks = load('tasks')
const view = (name: string) => tasks.views.find((v) => v.name === name)!

describe('defaultsFromView', () => {
  it('采用「是」条件：Inbox 视图新建的任务 status = inbox', () => {
    expect(defaultsFromView(tasks, view('Inbox'))).toEqual({ status: 'inbox' })
  })

  it('any 组取第一个能采用的条件：Today 视图会勾上 My Day', () => {
    expect(defaultsFromView(tasks, view('Today'))).toEqual({ my_day: true })
  })

  it('any 组里已有条件被满足时不再添加', () => {
    const v = { name: 'x', type: 'list' as const, filter: [['my_day', 'is', true], { any: [['priority', 'is', 'high']] }] }
    expect(defaultsFromView(tasks, v as never)).toEqual({ my_day: true, priority: 'high' })
    const w = { name: 'x', type: 'list' as const, filter: [['priority', 'is', 'low'], { any: [['priority', 'is', 'high']] }] }
    expect(defaultsFromView(tasks, w as never)).toEqual({ priority: 'low' })
  })

  it('日期范围条件取今天', () => {
    expect(defaultsFromView(tasks, view('Next 7 Days'))).toEqual({ due: 'today' })
  })

  it('所在分组覆盖过滤条件；多值字段写成列表；空分组清掉该字段', () => {
    expect(defaultsFromView(tasks, view('Inbox'), { group: { field: 'status', key: 'next' } })).toEqual({
      status: 'next'
    })
    expect(defaultsFromView(tasks, view('等待中'), { group: { field: 'people', key: 'Alice' } })).toEqual({
      status: 'waiting',
      people: ['Alice']
    })
    expect(defaultsFromView(tasks, view('按项目'), { group: { field: 'project', key: 'CITS2002' } })).toEqual({
      project: 'CITS2002'
    })
    expect(defaultsFromView(tasks, view('Inbox'), { group: { field: 'status', key: null } })).toEqual({})
  })

  it('日历的某一天', () => {
    expect(defaultsFromView(tasks, view('日历'), { date: { field: 'due', day: '2026-10-20' } })).toEqual({
      due: '2026-10-20'
    })
  })

  it('忽略 $this 和计算字段', () => {
    const v = { name: 'x', type: 'list' as const, filter: [['project', 'is', '$this'], ['overdue', 'is', true]] }
    expect(defaultsFromView(tasks, v as never)).toEqual({})
  })
})

describe('字段', () => {
  it('区间开始字段、计算字段、内置字段都能识别', () => {
    expect(fieldInfo(tasks, 'start')).toMatchObject({ kind: 'date', label: '截止（开始）' })
    expect(fieldInfo(tasks, 'overdue')).toMatchObject({ kind: 'overdue', editable: false })
    expect(fieldInfo(tasks, 'name')).toMatchObject({ kind: 'title' })
    expect(fieldInfo(tasks, 'nope')).toBeNull()
  })

  it('选项颜色：完成值是绿色，其他按顺序', () => {
    const status = tasks.fields.status
    expect(tagColor(status, 'done')).toBe('green')
    expect(tagColor(status, 'inbox')).toBe('gray')
    expect(tagColor(status, 'next')).toBe('blue')
    expect(tagColor({ type: 'multi_select', options: [] }, '课程')).toBe(tagColor(undefined, '课程'))
  })

  it('表格默认显示全部字段，columns 指定时按它，标题总在最前', () => {
    expect(visibleColumns(tasks, { name: 'x', type: 'table' })[0]).toBe('name')
    expect(visibleColumns(tasks, view('按项目'))).toEqual(['name', 'status', 'priority', 'due', 'project'])
    expect(visibleColumns(tasks, { name: 'x', type: 'table', columns: ['due', 'name'], hide: ['due'] })).toEqual([
      'name'
    ])
  })

  it('切换属性写成 columns', () => {
    const v = toggleColumn(tasks, view('按项目'), 'priority')
    expect(v.columns).toEqual(['name', 'status', 'due', 'project'])
    expect(toggleColumn(tasks, v, 'labels').columns).toEqual(['name', 'status', 'due', 'project', 'labels'])
  })

  it('看板卡片默认显示几个常用字段，不含分组字段', () => {
    const cols = visibleColumns(tasks, view('看板'))
    expect(cols).not.toContain('status')
    expect(cols.length).toBeLessThanOrEqual(4)
  })
})

describe('视图', () => {
  it('判断是否被修改时忽略空值和键顺序', () => {
    expect(sameView({ name: 'a', type: 'list', filter: [] }, { type: 'list', name: 'a' })).toBe(true)
    expect(sameView({ name: 'a', type: 'list' }, { name: 'a', type: 'list', sort: ['due'] })).toBe(false)
  })

  it('新建视图的默认设置和名字', () => {
    expect(newView(tasks, 'board', '看板 2')).toEqual({ name: '看板 2', type: 'board', group: 'status' })
    expect(newView(tasks, 'calendar', 'c')).toMatchObject({ date: 'due' })
    expect(uniqueViewName(tasks, '看板')).toBe('看板 2')
    expect(uniqueViewName(tasks, '画廊')).toBe('画廊')
  })

  it('看板分组和日历日期字段的检查', () => {
    expect(viewProblem(tasks, { name: 'x', type: 'board', group: 'due' })).toContain('看板')
    expect(viewProblem(tasks, { name: 'x', type: 'calendar' })).toContain('日历')
    expect(viewProblem(tasks, view('看板'))).toBeNull()
  })

  it('操作符按字段类型给出；条件计数包含嵌套', () => {
    expect(opsFor('relation')).toContain('contains')
    expect(opsFor('date')).toContain('within')
    expect(countConditions(view('Today').filter)).toBe(5)
  })
})

describe('日期', () => {
  it('月历从周一开始，整周', () => {
    const grid = monthGrid(2026, 9) // 2026 年 10 月 1 日是周四
    expect(grid[0]).toBe('2026-09-28')
    expect(grid.at(-1)).toBe('2026-11-01')
    expect(grid.length % 7).toBe(0)
  })

  it('平移日期保留时间；天数差', () => {
    expect(shiftDate('2026-10-31T09:30', 1)).toBe('2026-11-01T09:30')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(dayDiff('2026-10-01', '2026-10-17')).toBe(16)
  })

  it('显示：今天、明天、同年省略年份', () => {
    expect(formatDate('2026-10-03', '2026-10-03')).toBe('今天')
    expect(formatDate('2026-10-04T14:00', '2026-10-03')).toBe('明天 14:00')
    expect(formatDate('2026-12-25', '2026-10-03')).toBe('12月25日')
    expect(formatDate('2025-12-25', '2026-10-03')).toBe('2025年12月25日')
  })
})
