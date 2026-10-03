import { useEffect, useState } from 'react'
import type { VaultInspection } from '@shared/ipc'
import { Sidebar, type Page } from '@/components/Sidebar'
import { ToastProvider } from '@/hooks/toast'
import { VaultDataProvider } from '@/hooks/vault-data'
import { api, errorMessage } from '@/lib/api'
import { DatabasePage } from '@/pages/Database'
import { Home } from '@/pages/Home'
import { Settings } from '@/pages/Settings'
import { Welcome } from '@/pages/Welcome'

const PAGE_KEY = 'sb:page'

function lastPage(): Page {
  try {
    const p = JSON.parse(localStorage.getItem(PAGE_KEY) ?? 'null') as Page | null
    if (p && (p.kind === 'home' || p.kind === 'settings' || (p.kind === 'db' && typeof p.id === 'string'))) return p
  } catch {
    // 忽略损坏的记录
  }
  return { kind: 'home' }
}

type Boot = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready' }

export default function App() {
  const [boot, setBoot] = useState<Boot>({ kind: 'loading' })
  const [vault, setVault] = useState<VaultInspection | null>(null)
  const [page, setPage] = useState<Page>(lastPage)
  const navigate = (next: Page): void => {
    setPage(next)
    try {
      localStorage.setItem(PAGE_KEY, JSON.stringify(next))
    } catch {
      // 记不住上次的页面也没关系
    }
  }

  useEffect(() => {
    api.vault
      .current()
      .then((current) => {
        setVault(current)
        setBoot({ kind: 'ready' })
      })
      .catch((err) => setBoot({ kind: 'error', message: errorMessage(err) }))
  }, [])

  if (boot.kind === 'loading') return null

  if (boot.kind === 'error') {
    return (
      <p role="alert" className="p-8 text-destructive">
        启动失败：{boot.message}
      </p>
    )
  }

  if (!vault || vault.state !== 'vault') {
    return (
      <Welcome
        previous={vault}
        onReady={(next) => {
          setVault(next)
          navigate({ kind: 'home' })
        }}
      />
    )
  }

  return (
    <ToastProvider>
      {/* 换了知识库就整体重新加载 */}
      <VaultDataProvider key={vault.path}>
        <div className="flex h-full">
          <Sidebar vault={vault} page={page} onNavigate={navigate} />
          <main className="min-w-0 flex-1 overflow-hidden">
            {page.kind === 'home' && (
              <div className="h-full overflow-y-auto">
                <Home vault={vault} />
              </div>
            )}
            {page.kind === 'settings' && (
              <div className="h-full overflow-y-auto">
                <Settings vault={vault} onVaultChange={setVault} />
              </div>
            )}
            {page.kind === 'db' && <DatabasePage db={page.id} />}
          </main>
        </div>
      </VaultDataProvider>
    </ToastProvider>
  )
}
