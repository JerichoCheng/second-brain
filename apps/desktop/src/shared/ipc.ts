import type { ErrorPayload } from './errors'

export type FolderState =
  /** 文件夹不存在（比如被移动或删除了） */
  | 'missing'
  /** 空文件夹（忽略 .git、desktop.ini 等） */
  | 'empty'
  /** 已经是 vault */
  | 'vault'
  /** 有其他文件，不是 vault */
  | 'non-empty'

export interface VaultInspection {
  path: string
  /** 文件夹名，用作 vault 的显示名 */
  name: string
  state: FolderState
  isGitRepo: boolean
  /** 标准目录中缺少的 */
  missingDirs: string[]
}

export interface InitOptions {
  /** 文件夹里已有其他文件时也继续；只添加缺少的目录和文件，不改动已有内容 */
  allowNonEmpty?: boolean
}

export type GitStatus =
  /** 这次新建了仓库 */
  | 'created'
  /** 原来就是 git 仓库，没有动 */
  | 'existing'
  /** 电脑上找不到 git */
  | 'unavailable'
  | 'failed'

export interface GitInitResult {
  status: GitStatus
  /** 是否做了第一次提交 */
  committed: boolean
  /** 需要告诉用户的情况 */
  message?: string
}

export interface InitResult {
  vault: VaultInspection
  createdDirs: string[]
  createdFiles: string[]
  git: GitInitResult
}

export interface AppInfo {
  version: string
  electron: string
  chrome: string
  node: string
  platform: string
  userData: string
}

export interface AppSettings {
  vaultPath: string | null
}

/**
 * 主进程与界面之间的全部 IPC 通道。
 * 新增通道：在这里加一项 → 在 main/ipc.ts 实现 → 在 renderer/src/lib/api.ts 包一层。
 * 前两步漏掉任何一步，类型检查都会报错。
 */
export interface IpcContract {
  'app:info': { args: []; result: AppInfo }
  'vault:current': { args: []; result: VaultInspection | null }
  'vault:pick-folder': { args: []; result: string | null }
  'vault:inspect': { args: [path: string]; result: VaultInspection }
  'vault:initialize': { args: [path: string, options: InitOptions]; result: InitResult }
  'vault:open': { args: [path: string]; result: VaultInspection }
  'vault:reveal': { args: []; result: void }
}

export type IpcChannel = keyof IpcContract
export type IpcArgs<C extends IpcChannel> = IpcContract[C]['args']
export type IpcReturn<C extends IpcChannel> = IpcContract[C]['result']

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: ErrorPayload }

/** 预加载脚本允许转发的通道。写成 Record 是为了让编译器检查有没有漏掉 */
const CHANNELS: Record<IpcChannel, true> = {
  'app:info': true,
  'vault:current': true,
  'vault:pick-folder': true,
  'vault:inspect': true,
  'vault:initialize': true,
  'vault:open': true,
  'vault:reveal': true
}

export function isIpcChannel(value: unknown): value is IpcChannel {
  return typeof value === 'string' && Object.hasOwn(CHANNELS, value)
}

/** 预加载脚本通过 contextBridge 暴露为 window.brain */
export interface BrainBridge {
  invoke<C extends IpcChannel>(channel: C, ...args: IpcArgs<C>): Promise<IpcResult<IpcReturn<C>>>
}
