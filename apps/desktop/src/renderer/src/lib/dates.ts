/**
 * 界面用的日期工具。日期统一是本地时区的 `YYYY-MM-DD` 或 `YYYY-MM-DDTHH:mm` 字符串，
 * 和 vault-core 的约定一致；不用 toISOString（那是 UTC，珀斯早上 8 点前会得到昨天）。
 */

export const DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/

const pad = (n: number): string => String(n).padStart(2, '0')

export function localDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function today(): string {
  return localDate(new Date())
}

export function parseDay(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number)
  return new Date(y!, m! - 1, d!)
}

export function addDays(day: string, n: number): string {
  const d = parseDay(day)
  d.setDate(d.getDate() + n)
  return localDate(d)
}

/** b 比 a 晚几天 */
export function dayDiff(a: string, b: string): number {
  return Math.round((parseDay(b).getTime() - parseDay(a).getTime()) / 86_400_000)
}

/** 日期部分 */
export function dayOf(value: string): string {
  return value.slice(0, 10)
}

/** 时间部分（HH:mm），没有时为 null */
export function timeOf(value: string): string | null {
  return value.length > 10 ? value.slice(11, 16) : null
}

export function withTime(day: string, time: string | null): string {
  return time ? `${day}T${time}` : day
}

/** 平移若干天，保留时间部分 */
export function shiftDate(value: string, days: number): string {
  return withTime(addDays(dayOf(value), days), timeOf(value))
}

/**
 * 月历网格：从包含 1 号的那一周的第一天开始，到包含月末的那一周结束。
 * weekStart：1 = 周一（默认），0 = 周日。month 从 0 开始。
 */
export function monthGrid(year: number, month: number, weekStart: 0 | 1 = 1): string[] {
  const first = new Date(year, month, 1)
  const offset = (first.getDay() - weekStart + 7) % 7
  const start = localDate(new Date(year, month, 1 - offset))
  const last = new Date(year, month + 1, 0)
  const tail = (weekStart + 6 - last.getDay() + 7) % 7
  const total = offset + last.getDate() + tail
  return Array.from({ length: total }, (_, i) => addDays(start, i))
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

export function weekdayNames(weekStart: 0 | 1 = 1): string[] {
  return [...WEEKDAYS.slice(weekStart), ...WEEKDAYS.slice(0, weekStart)]
}

/** 显示用：今天 / 明天 / 昨天 / 10月17日 / 2025年10月17日，带时间时加上 14:00 */
export function formatDate(value: string, now: string = today()): string {
  if (!DATE_RE.test(value)) return value
  const d = dayOf(value)
  const diff = dayDiff(now, d)
  let text: string
  if (diff === 0) text = '今天'
  else if (diff === 1) text = '明天'
  else if (diff === -1) text = '昨天'
  else {
    const [y, m, day] = d.split('-').map(Number)
    text = y === Number(now.slice(0, 4)) ? `${m}月${day}日` : `${y}年${m}月${day}日`
  }
  const t = timeOf(value)
  return t ? `${text} ${t}` : text
}

export function formatMonth(year: number, month: number): string {
  return `${year}年${month + 1}月`
}

/** 修改时间（毫秒时间戳）的显示 */
export function formatTimestamp(ms: number, now: string = today()): string {
  const d = new Date(ms)
  return formatDate(`${localDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`, now)
}
