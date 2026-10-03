import { FolderOpen } from 'lucide-react'
import type { VaultInspection } from '@shared/ipc'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'

export function Home({ vault }: { vault: VaultInspection }) {
  return (
    <div className="mx-auto max-w-3xl px-14 pt-16 pb-16">
      <h1 className="text-[32px] leading-tight font-bold tracking-tight">{vault.name}</h1>
      <p className="mt-3 max-w-[60ch] text-muted-foreground">
        知识库还是空的。任务、项目和笔记的视图会在后续版本里加入；现在可以先在资源管理器里看看生成的文件夹。
      </p>
      <Button variant="outline" className="mt-6" onClick={() => void api.vault.reveal()}>
        <FolderOpen />
        在资源管理器中打开
      </Button>
    </div>
  )
}
