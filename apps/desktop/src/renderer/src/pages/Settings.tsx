import { useEffect, useState } from 'react'
import { FolderOpen } from 'lucide-react'
import type { AppInfo, GitInitResult, VaultInspection } from '@shared/ipc'
import { GitStatusLine } from '@/components/GitStatusLine'
import { VaultSetup } from '@/components/VaultSetup'
import { Button } from '@/components/ui/button'
import { api, errorMessage } from '@/lib/api'

interface Props {
  vault: VaultInspection
  onVaultChange: (vault: VaultInspection) => void
}

export function Settings({ vault, onVaultChange }: Props) {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [changing, setChanging] = useState(false)
  const [repairing, setRepairing] = useState(false)
  const [repairGit, setRepairGit] = useState<GitInitResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void api.app.info().then(setInfo)
  }, [])

  const complete = vault.missingDirs.length === 0 && vault.isGitRepo

  async function repair() {
    setError(null)
    setRepairing(true)
    try {
      const result = await api.vault.initialize(vault.path, { allowNonEmpty: true })
      setRepairGit(result.git)
      onVaultChange(result.vault)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setRepairing(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-14 pt-16 pb-16">
      <h1 className="text-[32px] leading-tight font-bold tracking-tight">设置</h1>

      <section className="mt-10">
        <h2 className="border-b pb-2 text-base font-semibold">知识库</h2>

        <dl className="mt-2 divide-y">
          <Row label="位置">
            <div className="flex items-center gap-3">
              <span className="min-w-0 flex-1 truncate font-mono text-[13px]" title={vault.path}>
                {vault.path}
              </span>
              <Button variant="outline" size="sm" onClick={() => void api.vault.reveal()}>
                <FolderOpen />
                打开
              </Button>
            </div>
          </Row>
          <Row label="Git 仓库">{vault.isGitRepo ? '已启用' : '未启用'}</Row>
          <Row label="标准目录">
            {vault.missingDirs.length === 0 ? (
              '完整'
            ) : (
              <span>
                缺少 {vault.missingDirs.length} 个：
                <span className="font-mono text-[13px]">{vault.missingDirs.join('、')}</span>
              </span>
            )}
          </Row>
        </dl>

        <div className="mt-4 space-y-3">
          {!complete && (
            <Button onClick={repair} disabled={repairing}>
              {repairing ? '正在检查…' : '检查并补全'}
            </Button>
          )}
          {repairGit && repairGit.status !== 'existing' && <GitStatusLine git={repairGit} />}
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}

          {changing ? (
            <div className="rounded-md border p-4">
              <p className="mb-3 text-muted-foreground">
                更换后应用会使用新的文件夹，原来的文件夹不会被改动或删除。
              </p>
              <VaultSetup
                onCancel={() => setChanging(false)}
                onComplete={(next) => {
                  setChanging(false)
                  setRepairGit(null)
                  onVaultChange(next)
                }}
              />
            </div>
          ) : (
            <Button variant="outline" onClick={() => setChanging(true)}>
              更换知识库文件夹
            </Button>
          )}
        </div>
      </section>

      {info && (
        <section className="mt-12">
          <h2 className="border-b pb-2 text-base font-semibold">关于</h2>
          <dl className="mt-2 divide-y">
            <Row label="版本">{info.version}</Row>
            <Row label="运行环境">
              Electron {info.electron}，Chromium {info.chrome}，Node {info.node}
            </Row>
            <Row label="应用设置">
              <span className="font-mono text-[13px] break-all">{info.userData}</span>
            </Row>
          </dl>
        </section>
      )}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] items-center gap-4 py-2.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  )
}
