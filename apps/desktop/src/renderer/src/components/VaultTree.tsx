import { Check, Circle, Minus } from 'lucide-react'
import { VAULT_DIRS, dirDepth } from '@shared/vault-layout'
import { cn } from '@/lib/utils'

export type DirMark = 'pending' | 'created' | 'existing'

interface Props {
  marks: Record<string, DirMark>
  /** 创建完成后逐项打勾 */
  animate?: boolean
}

/** 按 VAULT_DIRS 画出知识库的目录树，每项标明待创建 / 已创建 / 原本就有 */
export function VaultTree({ marks, animate = false }: Props) {
  let createdIndex = 0

  return (
    <ul className="rounded-md border bg-muted/40 py-2 font-mono text-[13px]" aria-label="知识库目录">
      {VAULT_DIRS.map((dir) => {
        const mark = marks[dir.path] ?? 'pending'
        const delay = mark === 'created' ? createdIndex++ * 35 : 0
        const name = dir.path.split('/').at(-1)

        return (
          <li
            key={dir.path}
            className="flex items-center gap-2 px-3 py-[3px]"
            style={{ paddingLeft: `${0.75 + dirDepth(dir.path) * 1.25}rem` }}
          >
            <span className="flex size-4 items-center justify-center" aria-hidden>
              {mark === 'pending' && <Circle className="size-3 text-muted-foreground/60" />}
              {mark === 'existing' && <Minus className="size-3 text-muted-foreground" />}
              {mark === 'created' && (
                <Check
                  className={cn('size-3.5 text-success', animate && 'tick-in')}
                  style={animate ? { animationDelay: `${delay}ms` } : undefined}
                  strokeWidth={3}
                />
              )}
            </span>
            <span className={cn(mark === 'pending' && 'text-muted-foreground')}>{name}/</span>
            <span className="truncate font-sans text-muted-foreground">{dir.label}</span>
            <span className="sr-only">
              {mark === 'created' ? '已创建' : mark === 'existing' ? '原本就有' : '待创建'}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

export function pendingMarks(): Record<string, DirMark> {
  return Object.fromEntries(VAULT_DIRS.map((d) => [d.path, 'pending' as const]))
}

export function resultMarks(createdDirs: string[]): Record<string, DirMark> {
  const created = new Set(createdDirs)
  return Object.fromEntries(VAULT_DIRS.map((d) => [d.path, created.has(d.path) ? 'created' : 'existing']))
}
