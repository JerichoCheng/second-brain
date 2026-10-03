import { GitBranch, TriangleAlert } from 'lucide-react'
import type { GitInitResult } from '@shared/ipc'

export function GitStatusLine({ git }: { git: GitInitResult }) {
  const fine = git.status === 'existing' || (git.status === 'created' && git.committed)
  const text =
    git.status === 'existing'
      ? '文件夹原本就是 git 仓库，没有改动。'
      : git.status === 'created' && git.committed
        ? '已创建 git 仓库，并完成第一次提交。'
        : (git.message ?? '没有创建 git 仓库。')

  return (
    <p
      className={
        fine
          ? 'flex items-start gap-2 text-muted-foreground'
          : 'flex items-start gap-2 rounded-md bg-warning-surface px-3 py-2 text-warning'
      }
    >
      {fine ? (
        <GitBranch className="mt-1 size-4 shrink-0" />
      ) : (
        <TriangleAlert className="mt-1 size-4 shrink-0" />
      )}
      <span>{text}</span>
    </p>
  )
}
