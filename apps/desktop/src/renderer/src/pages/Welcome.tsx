import type { VaultInspection } from '@shared/ipc'
import { VaultSetup } from '@/components/VaultSetup'

interface Props {
  /** 上次使用、但现在打不开的知识库 */
  previous: VaultInspection | null
  onReady: (vault: VaultInspection) => void
}

export function Welcome({ previous, onReady }: Props) {
  return (
    <main className="h-full overflow-y-auto">
      <div className="mx-auto max-w-xl px-8 pt-[12vh] pb-16">
        <h1 className="text-[32px] leading-tight font-bold tracking-tight">选择存放知识库的文件夹</h1>
        <p className="mt-3 text-muted-foreground">
          任务、项目和笔记都会以 Markdown 文件保存在这个文件夹里，可以用任何编辑器打开，也可以用 git
          备份。建议新建一个空文件夹，不要放在代码仓库里。
        </p>

        {previous && (
          <p className="mt-4 rounded-md bg-warning-surface px-3 py-2 text-warning">
            {previous.state === 'missing'
              ? '上次使用的知识库找不到了，可能被移动或删除了。重新选择它现在的位置即可：'
              : '上次使用的文件夹已经不是知识库了：'}
            <span className="mt-1 block font-mono text-[13px] break-all">{previous.path}</span>
          </p>
        )}

        <div className="mt-8">
          <VaultSetup onComplete={onReady} />
        </div>
      </div>
    </main>
  )
}
