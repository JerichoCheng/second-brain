import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  addDays,
  dayOf,
  formatDate,
  formatMonth,
  monthGrid,
  parseDay,
  timeOf,
  today,
  weekdayNames,
  withTime
} from '@/lib/dates'
import { cn } from '@/lib/utils'

export interface DateValue {
  /** 日期（区间时是结束日期） */
  value: string | null
  /** 区间的开始日期；字段不支持区间时为 undefined */
  start?: string | null
}

interface Props {
  initial: DateValue
  /** 字段支持区间（schema 里写了 range） */
  rangeCapable: boolean
  /** 每次修改都会调用；父组件在弹出框关闭时写入 */
  onChange: (next: DateValue) => void
  /** 选好了，关闭弹出框 */
  onDone: () => void
}

function nextMonday(): string {
  const t = today()
  return addDays(t, 7 - ((parseDay(t).getDay() + 6) % 7))
}

export function DateEditor({ initial, rangeCapable, onChange, onDone }: Props) {
  const [state, setState] = useState<DateValue>(initial)
  const [rangeOn, setRangeOn] = useState(rangeCapable && !!initial.start)
  const [active, setActive] = useState<'start' | 'end'>('end')
  const anchor = (rangeOn && active === 'start' ? state.start : state.value) ?? state.value ?? today()
  const [cursor, setCursor] = useState(() => parseDay(anchor))
  const year = cursor.getFullYear()
  const month = cursor.getMonth()
  const time = timeOf((active === 'start' ? state.start : state.value) ?? '')

  const update = (next: DateValue): void => {
    setState(next)
    onChange(next)
  }

  const pickDay = (day: string): void => {
    if (!rangeOn) {
      update({ ...state, value: withTime(day, timeOf(state.value ?? '')) })
      onDone()
      return
    }
    if (active === 'start') {
      const start = withTime(day, timeOf(state.start ?? ''))
      const end = state.value && dayOf(state.value) < day ? withTime(day, timeOf(state.value)) : state.value
      update({ value: end ?? start, start })
      setActive('end')
    } else {
      const end = withTime(day, timeOf(state.value ?? ''))
      // 结束早于开始时，两者对调
      if (state.start && day < dayOf(state.start)) update({ value: state.start, start: end })
      else update({ ...state, value: end })
    }
  }

  const setTime = (t: string | null): void => {
    if (active === 'start' && rangeOn) {
      if (state.start) update({ ...state, start: withTime(dayOf(state.start), t) })
    } else if (state.value) {
      update({ ...state, value: withTime(dayOf(state.value), t) })
    }
  }

  const toggleRange = (on: boolean): void => {
    setRangeOn(on)
    if (on) {
      setActive('start')
      if (!state.start && state.value) update({ ...state, start: dayOf(state.value) })
    } else {
      setActive('end')
      update({ ...state, start: null })
    }
  }

  const grid = monthGrid(year, month)
  const now = today()
  const startDay = rangeOn && state.start ? dayOf(state.start) : null
  const endDay = state.value ? dayOf(state.value) : null

  return (
    <div className="w-72 p-3 text-[13px]">
      {rangeOn && (
        <div className="mb-3 grid grid-cols-2 gap-2">
          {(['start', 'end'] as const).map((which) => {
            const v = which === 'start' ? state.start : state.value
            return (
              <button
                key={which}
                type="button"
                onClick={() => {
                  setActive(which)
                  if (v) setCursor(parseDay(v))
                }}
                className={cn(
                  'flex flex-col items-start rounded-md border px-2 py-1 text-left',
                  active === which ? 'border-ring ring-2 ring-ring/20' : 'hover:bg-hover'
                )}
              >
                <span className="text-[11px] text-muted-foreground">{which === 'start' ? '开始' : '结束'}</span>
                <span className="truncate">{v ? formatDate(v) : '未设置'}</span>
              </button>
            )
          })}
        </div>
      )}

      <div className="mb-1 flex items-center justify-between">
        <span className="font-medium">{formatMonth(year, month)}</span>
        <span className="flex">
          <Button variant="ghost" size="icon" className="size-7" onClick={() => setCursor(new Date(year, month - 1, 1))} aria-label="上个月">
            <ChevronLeft />
          </Button>
          <Button variant="ghost" size="icon" className="size-7" onClick={() => setCursor(new Date(year, month + 1, 1))} aria-label="下个月">
            <ChevronRight />
          </Button>
        </span>
      </div>

      <div className="grid grid-cols-7 text-center">
        {weekdayNames().map((w) => (
          <span key={w} className="py-1 text-[11px] text-muted-foreground">
            {w.slice(1)}
          </span>
        ))}
        {grid.map((day) => {
          const inMonth = parseDay(day).getMonth() === month
          const selected = day === endDay || day === startDay
          const between = startDay && endDay && day > startDay && day < endDay
          return (
            <button
              key={day}
              type="button"
              onClick={() => pickDay(day)}
              className={cn(
                'mx-auto my-px flex size-8 items-center justify-center rounded-md tabular-nums',
                !inMonth && 'text-muted-foreground/50',
                between && 'bg-selected',
                selected ? 'bg-primary text-primary-foreground' : 'hover:bg-hover',
                day === now && !selected && 'font-semibold text-primary'
              )}
            >
              {Number(day.slice(8))}
            </button>
          )
        })}
      </div>

      <div className="mt-2 space-y-1.5 border-t pt-2">
        {rangeCapable && (
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={rangeOn} onChange={(e) => toggleRange(e.target.checked)} />
            日期区间
          </label>
        )}
        <label className="flex h-7 items-center gap-2">
          <input
            type="checkbox"
            checked={time !== null}
            disabled={!(active === 'start' && rangeOn ? state.start : state.value)}
            onChange={(e) => setTime(e.target.checked ? '09:00' : null)}
          />
          包含时间
          {time !== null && (
            <input
              type="time"
              value={time}
              onChange={(e) => e.target.value && setTime(e.target.value)}
              className="ml-auto h-7 rounded border border-input bg-background px-1.5"
            />
          )}
        </label>
      </div>

      <div className="mt-2 flex flex-wrap gap-1 border-t pt-2">
        <Button variant="ghost" size="sm" onClick={() => pickDay(now)}>
          今天
        </Button>
        <Button variant="ghost" size="sm" onClick={() => pickDay(addDays(now, 1))}>
          明天
        </Button>
        <Button variant="ghost" size="sm" onClick={() => pickDay(nextMonday())}>
          下周一
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto text-muted-foreground"
          onClick={() => {
            update({ value: null, ...(rangeCapable ? { start: null } : {}) })
            onDone()
          }}
        >
          清除
        </Button>
      </div>
    </div>
  )
}
