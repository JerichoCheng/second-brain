import { useState } from 'react'
import { FolderOpen, TriangleAlert } from 'lucide-react'
import type { InitResult, VaultInspection } from '@shared/ipc'
import { Button } from '@/components/ui/button'
import { api, errorMessage } from '@/lib/api'
import { GitStatusLine } from './GitStatusLine'
import { VaultTree, pendingMarks, resultMarks } from './VaultTree'

type Step =
  | { kind: 'idle' }
  | { kind: 'picked'; vault: VaultInspection }
  | { kind: 'working'; vault: VaultInspection }
  | { kind: 'done'; result: InitResult }

interface Props {
  onComplete: (vault: VaultInspection) => void
  onCancel?: () => void
}

/** 选择文件夹 → 检查 → 创建或打开知识库 */
export function VaultSetup({ onComplete, onCancel }: Props) {
  const [step, setStep] = useState<Step>({ kind: 'idle' })
  const [error, setError] = useState<string | null>(null)

  async function pick() {
    setError(null)
    try {
      const path = await api.vault.pickFolder()
      if (!path) return
      setStep({ kind: 'picked', vault: await api.vault.inspect(path) })
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  async function create(vault: VaultInspection, allowNonEmpty: boolean) {
    setError(null)
    setStep({ kind: 'working', vault })
    try {
      setStep({ kind: 'done', result: await api.vault.initialize(vault.path, { allowNonEmpty }) })
    } catch (err) {
      setError(errorMessage(err))
      setStep({ kind: 'picked', vault })
    }
  }

  async function open(vault: VaultInspection) {
    setError(null)
    try {
      onComplete(await api.vault.open(vault.path))
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  if (step.kind === 'done') {
    const { result } = step
    return (
      <div className="space-y-4">
        <PathBox path={result.vault.path} />
        <p>知识库已建好，新建了 {result.createdDirs.length} 个文件夹。</p>
        <VaultTree marks={resultMarks(result.createdDirs)} animate />
        <GitStatusLine git={result.git} />
        <Button onClick={() => onComplete(result.vault)}>开始使用</Button>
      </div>
    )
  }

  if (step.kind === 'idle') {
    return (
      <div className="space-y-3">
        <div className="flex gap-2">
          <Button onClick={pick}>
            <FolderOpen />
            选择文件夹
          </Button>
          {onCancel && (
            <Button variant="ghost" onClick={onCancel}>
              取消
            </Button>
          )}
        </div>
        {error && <ErrorText message={error} />}
      </div>
    )
  }

  const { vault } = step
  const busy = step.kind === 'working'

  return (
    <div className="space-y-4">
      <PathBox path={vault.path} onChange={busy ? undefined : pick} />

      {(vault.state === 'empty' || vault.state === 'missing') && (
        <>
          <p>会在这个文件夹里创建下面这些目录：</p>
          <VaultTree marks={pendingMarks()} />
          <Actions onCancel={busy ? undefined : onCancel}>
            <Button onClick={() => create(vault, false)} disabled={busy}>
              {busy ? '正在创建…' : '创建知识库'}
            </Button>
          </Actions>
        </>
      )}

      {vault.state === 'vault' && (
        <>
          <p>这个文件夹已经是一个知识库。</p>
          {vault.missingDirs.length > 0 && (
            <p className="text-muted-foreground">
              缺少 {vault.missingDirs.length} 个标准目录，打开后可以在设置里补全。
            </p>
          )}
          <Actions onCancel={onCancel}>
            <Button onClick={() => open(vault)}>打开知识库</Button>
          </Actions>
        </>
      )}

      {vault.state === 'non-empty' && (
        <>
          <div className="flex items-start gap-2 rounded-md bg-warning-surface px-3 py-2 text-warning">
            <TriangleAlert className="mt-1 size-4 shrink-0" />
            <p>
              这个文件夹里已经有其他文件。建议换一个空文件夹。如果继续，只会添加缺少的目录，不会改动已有文件，也不会自动提交到
              git。
            </p>
          </div>
          <Actions onCancel={busy ? undefined : onCancel}>
            <Button onClick={pick} disabled={busy}>
              换一个文件夹
            </Button>
            <Button variant="outline" onClick={() => create(vault, true)} disabled={busy}>
              {busy ? '正在创建…' : '仍然在这里创建'}
            </Button>
          </Actions>
        </>
      )}

      {error && <ErrorText message={error} />}
    </div>
  )
}

function PathBox({ path, onChange }: { path: string; onChange?: () => void }) {
  return (
    <div className="flex items-center gap-2 rounded-md border px-3 py-2">
      <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate font-mono text-[13px]" title={path}>
        {path}
      </span>
      {onChange && (
        <Button variant="link" size="sm" className="h-auto px-0" onClick={onChange}>
          换一个
        </Button>
      )}
    </div>
  )
}

function Actions({ children, onCancel }: { children: React.ReactNode; onCancel?: () => void }) {
  return (
    <div className="flex gap-2">
      {children}
      {onCancel && (
        <Button variant="ghost" onClick={onCancel}>
          取消
        </Button>
      )}
    </div>
  )
}

function ErrorText({ message }: { message: string }) {
  return (
    <p role="alert" className="text-destructive">
      {message}
    </p>
  )
}
