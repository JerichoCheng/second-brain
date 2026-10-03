import { House, Settings } from 'lucide-react'
import type { VaultInspection } from '@shared/ipc'
import { cn } from '@/lib/utils'

export type Page = 'home' | 'settings'

const NAV: Array<{ page: Page; label: string; icon: typeof House }> = [
  { page: 'home', label: '首页', icon: House },
  { page: 'settings', label: '设置', icon: Settings }
]

interface Props {
  vault: VaultInspection
  page: Page
  onNavigate: (page: Page) => void
}

export function Sidebar({ vault, page, onNavigate }: Props) {
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

      <nav className="flex flex-col gap-px px-2 py-1" aria-label="主导航">
        {NAV.map(({ page: target, label, icon: Icon }) => (
          <button
            key={target}
            type="button"
            onClick={() => onNavigate(target)}
            aria-current={page === target ? 'page' : undefined}
            className={cn(
              'flex h-7 items-center gap-2 rounded px-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
              page === target
                ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
                : 'hover:bg-sidebar-accent/60'
            )}
          >
            <Icon className="size-4 opacity-70" />
            {label}
          </button>
        ))}
      </nav>
    </aside>
  )
}
