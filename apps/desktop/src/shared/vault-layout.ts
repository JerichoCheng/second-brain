/**
 * vault 的标准目录结构，与 docs/ARCHITECTURE.md 保持一致。
 * 主进程按它创建目录，界面按它显示预览。
 */
export interface VaultDir {
  /** 相对 vault 根目录的路径，统一用 `/` 分隔 */
  path: string
  /** 界面上显示的说明 */
  label: string
}

export const VAULT_DIRS: readonly VaultDir[] = [
  { path: '.brain', label: '应用数据' },
  { path: '.brain/schema', label: '数据库定义' },
  { path: 'inbox', label: '待处理的捕获内容与 AI 提案' },
  { path: 'tasks', label: '任务' },
  { path: 'projects', label: '项目' },
  { path: 'notes', label: '笔记' },
  { path: 'areas', label: '领域与资源' },
  { path: 'goals', label: '目标与里程碑' },
  { path: 'study', label: '学习' },
  { path: 'study/corrections', label: '错题本' },
  { path: 'study/vocab', label: '英语词汇' },
  { path: 'people', label: '联系人' },
  { path: 'books', label: '书' },
  { path: 'recipes', label: '食谱' },
  { path: 'meals', label: '餐食计划' },
  { path: 'reviews', label: '复盘' },
  { path: 'reviews/daily', label: '每日' },
  { path: 'reviews/weekly', label: '每周' },
  { path: 'mail', label: '每日邮件日报' },
  { path: 'templates', label: '新建条目用的模板' },
  { path: 'attachments', label: '图片与附件' }
]

/** 存在这个文件就说明文件夹是一个 vault */
export const VAULT_MARKER = '.brain/vault.json'
export const VAULT_FORMAT = 1

/** 没有子目录的目录，需要放 .gitkeep 才能被 git 跟踪 */
export function leafDirs(dirs: readonly VaultDir[] = VAULT_DIRS): string[] {
  return dirs
    .map((d) => d.path)
    .filter((p) => !dirs.some((other) => other.path.startsWith(p + '/')))
}

export function dirDepth(path: string): number {
  return path.split('/').length - 1
}
