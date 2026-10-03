import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { localDate } from '@second-brain/vault-core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { VaultChange } from '@shared/db'
import { DbService, sanitizeView } from './service'

let dir: string
let db: DbService
let changes: VaultChange[]

async function put(rel: string, content: string): Promise<void> {
  const p = join(dir, ...rel.split('/'))
  await mkdir(join(p, '..'), { recursive: true })
  await writeFile(p, content, 'utf8')
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sb-db-'))
  changes = []
  db = new DbService(
    async () => dir,
    (c) => changes.push(c)
  )
  await put('projects/CITS2002.md', '---\nstatus: active\n---\n')
  await put('tasks/写报告.md', '---\nstatus: next\npriority: high\nproject: "[[CITS2002]]"\ndue: 2026-10-17\nstart: 2026-10-10\n---\n正文\n')
  await put('tasks/买菜.md', '---\nstatus: done\n---\n')
})

afterEach(async () => {
  await db.close()
  await rm(dir, { recursive: true, force: true })
})

describe('DbService', () => {
  it('第一次使用时复制默认 schema', async () => {
    const { schemas, errors } = await db.schemas()
    expect(errors).toEqual([])
    expect(schemas.map((s) => s.id)).toContain('tasks')
  })

  it('查询结果带全部字段值、区间开始和计算字段', async () => {
    const { rows } = await db.query('tasks', { name: 'x', type: 'table', sort: ['name'] })
    const report = rows.find((r) => r.name === '写报告')!
    expect(report.path).toBe('tasks/写报告.md')
    expect(report.values).toMatchObject({
      status: 'next',
      priority: 'high',
      project: ['CITS2002'],
      due: '2026-10-17',
      start: '2026-10-10',
      my_day: false,
      subtasks: 0
    })
    expect(typeof report.values.mtime).toBe('number')

    const projects = await db.query('projects', { name: 'x', type: 'list' })
    expect(projects.rows[0]!.values.progress).toBe(0)
  })

  it('分组只传路径', async () => {
    const { groups } = await db.query('tasks', { name: '看板', type: 'board', group: 'status' })
    expect(groups!.find((g) => g.key === 'next')!.paths).toEqual(['tasks/写报告.md'])
    expect(groups!.find((g) => g.key === 'inbox')!.paths).toEqual([])
  })

  it('状态改成完成时自动填完成日期，改回时清空', async () => {
    const done = await db.update('tasks/写报告.md', { status: 'done' })
    expect(done.values.completed).toBe(localDate(new Date()))
    expect(await readFile(join(dir, 'tasks', '写报告.md'), 'utf8')).toContain('completed: ')

    const back = await db.update('tasks/写报告.md', { status: 'next' })
    expect(back.values.completed).toBeNull()
    expect(changes).toContainEqual({ kind: 'entries', paths: ['tasks/写报告.md'] })
  })

  it('新建条目：默认值 + 传入的字段；重名时自动加后缀', async () => {
    const row = await db.create('tasks', '写报告', { due: 'tomorrow', my_day: true })
    expect(row.name).toBe('写报告 (2)')
    expect(row.values).toMatchObject({ status: 'inbox', my_day: true })
  })

  it('校验失败变成 VAULT 错误', async () => {
    await expect(db.update('tasks/写报告.md', { status: 'nope' })).rejects.toMatchObject({ code: 'VAULT' })
    await expect(db.get('tasks/不存在.md')).rejects.toMatchObject({ code: 'VAULT' })
  })

  it('重命名后返回新路径，引用它的文件一起通知', async () => {
    const row = await db.rename('projects/CITS2002.md', 'CITS2002 Systems')
    expect(row.path).toBe('projects/CITS2002 Systems.md')
    expect(changes.at(-1)).toEqual({
      kind: 'entries',
      paths: ['projects/CITS2002.md', 'projects/CITS2002 Systems.md', 'tasks/写报告.md']
    })
  })

  it('保存视图写回 schema', async () => {
    const schema = await db.saveView('tasks', { name: '高优先级', type: 'list', filter: [['priority', 'is', 'high']] })
    expect(schema.views.at(-1)!.name).toBe('高优先级')
    expect(await readFile(join(dir, '.brain', 'schema', 'tasks.yaml'), 'utf8')).toContain(
      '  - name: 高优先级\n    type: list\n    filter: [[priority, is, high]]\n'
    )
    expect(changes).toContainEqual({ kind: 'schema' })
  })

  it('没有选择 vault 时报 NO_VAULT', async () => {
    const none = new DbService(
      async () => null,
      () => {}
    )
    await expect(none.schemas()).rejects.toMatchObject({ code: 'NO_VAULT' })
  })
})

describe('sanitizeView', () => {
  it('只保留认识的键', () => {
    expect(sanitizeView({ name: 'a', type: 'list', evil: 1, group: '', include_archived: 'yes' })).toEqual({
      name: 'a',
      type: 'list'
    })
  })

  it('拒绝无效的类型和格式', () => {
    expect(() => sanitizeView({ name: 'a', type: 'pie' })).toThrow('视图类型')
    expect(() => sanitizeView({ name: 'a', type: 'list', sort: 'name' })).toThrow('sort')
    expect(() => sanitizeView(null)).toThrow('视图')
  })
})
