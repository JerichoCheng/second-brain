import { House, Settings } from 'lucide-react'
import type { Schema } from '@shared/db'
import type { VaultInspection } from '@shared/ipc'
import { VAULT_DIRS } from '@shared/vault-layout'
import { useVaultData } from '@/hooks/vault-data'
import { cn } from '@/lib/utils'

export type Page = { kind: 'home' } | { kind: 'settings' } | { kind: 'db'; id: string }

const NAV: Array<{ page: Page; label: string; icon: typeof House }> = [
  { page: { kind: 'home' }, label: '首页', icon: House },
  { page: { kind: 'settings' }, label: '设置', icon: Settings }
]

/** 数据库按标准目录的顺序排（任务、项目、笔记……），不在标准目录里的排在最后 */
function sortDatabases(schemas: Schema[]): Schema[] {
  const order = (s: Schema): number => {
    const i = VAULT_DIRS.findIndex((d) => d.path === s.folder)
    return i === -1 ? VAULT_DIRS.length : i
  }
  return [...schemas].sort((a, b) => order(a) - order(b) || a.id.localeCompare(b.id))
}

function samePage(a: Page, b: Page): boolean {
  return a.kind === b.kind && (a.kind !== 'db' || a.id === (b as { id: string }).id)
}

interface Props {
  vault: VaultInspection
  page: Page
  onNavigate: (page: Page) => void
}

const itemClass = (active: boolean): string =>
  cn(
    'flex h-7 w-full items-center gap-2 rounded px-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
    active ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground' : 'hover:bg-sidebar-accent/60'
  )

export function Sidebar({ vault, page, onNavigate }: Props) {
  const { schemas } = useVaultData()

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2 px-3 pt-3 pb-2" title={vault.path}>
        <span
          className="flex size-6 items-center justify-center rounded bg-primary text-[13px] font-semibold text-primary-foreground"
          aria-hidden
        >
          {vault.name.slice(0, 1).toUpperCase()}
        </span>
        <span className="truncate font-medium text-sidebar-accent-foreground">{vault.name}</span>
      </div>

      <nav className="flex min-h-0 flex-1 flex-col gap-px overflow-y-auto px-2 py-1" aria-label="主导航">
        {NAV.slice(0, 1).map(({ page: target, label, icon: Icon }) => (
          <button
            key={label}
            type="button"
            onClick={() => onNavigate(target)}
            aria-current={samePage(page, target) ? 'page' : undefined}
            className={itemClass(samePage(page, target))}
          >
            <Icon className="size-4 opacity-70" />
            {label}
          </button>
        ))}

        <p className="mt-4 mb-1 px-2 text-[12px] font-medium text-muted-foreground">数据库</p>
        {sortDatabases(schemas).map((s) => {
          const target: Page = { kind: 'db', id: s.id }
          const active = samePage(page, target)
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onNavigate(target)}
              aria-current={active ? 'page' : undefined}
              className={itemClass(active)}
            >
              <span className="flex size-4 items-center justify-center text-[13px]" aria-hidden>
                {s.icon ?? '▦'}
              </span>
              <span className="truncate">{s.name}</span>
            </button>
          )
        })}
      </nav>

      <div className="border-t px-2 py-2">
        {NAV.slice(1).map(({ page: target, label, icon: Icon }) => (
          <button
            key={label}
            type="button"
            onClick={() => onNavigate(target)}
            aria-current={samePage(page, target) ? 'page' : undefined}
            className={itemClass(samePage(page, target))}
          >
            <Icon className="size-4 opacity-70" />
            {label}
          </button>
        ))}
      </div>
    </aside>
  )
}
