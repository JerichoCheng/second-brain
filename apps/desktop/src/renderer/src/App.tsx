import { useEffect, useState } from 'react'
import type { VaultInspection } from '@shared/ipc'
import { Sidebar, type Page } from '@/components/Sidebar'
import { api, errorMessage } from '@/lib/api'
import { Home } from '@/pages/Home'
import { Settings } from '@/pages/Settings'
import { Welcome } from '@/pages/Welcome'

type Boot = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready' }

export default function App() {
  const [boot, setBoot] = useState<Boot>({ kind: 'loading' })
  const [vault, setVault] = useState<VaultInspection | null>(null)
  const [page, setPage] = useState<Page>('home')

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
          setPage('home')
        }}
      />
    )
  }

  return (
    <div className="flex h-full">
      <Sidebar vault={vault} page={page} onNavigate={setPage} />
      <main className="min-w-0 flex-1 overflow-y-auto">
        {page === 'home' && <Home vault={vault} />}
        {page === 'settings' && <Settings vault={vault} onVaultChange={setVault} />}
      </main>
    </div>
  )
}
