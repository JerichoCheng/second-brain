import { app, BrowserWindow, dialog, ipcMain, shell, type IpcMainInvokeEvent } from 'electron'
import { BrainError, type ErrorPayload } from '@shared/errors'
import type { IpcArgs, IpcChannel, IpcResult, IpcReturn } from '@shared/ipc'
import { isAppUrl } from './security'
import { getSettings, updateSettings } from './settings'
import { assertAbsolutePath, initVault, inspectVault } from './vault/vault'

interface HandlerContext {
  window: BrowserWindow | null
}

type Handlers = {
  [C in IpcChannel]: (ctx: HandlerContext, ...args: IpcArgs<C>) => Promise<IpcReturn<C>>
}

/**
 * 所有 IPC 处理函数。参数来自界面，一律当作不可信输入重新校验。
 */
const handlers: Handlers = {
  'app:info': async () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
    userData: app.getPath('userData')
  }),

  'vault:current': async () => {
    const { vaultPath } = await getSettings()
    return vaultPath ? inspectVault(vaultPath) : null
  },

  'vault:pick-folder': async ({ window }) => {
    const options: Electron.OpenDialogOptions = {
      title: '选择知识库文件夹',
      buttonLabel: '选择',
      properties: ['openDirectory', 'createDirectory']
    }
    const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options)
    return result.canceled ? null : (result.filePaths[0] ?? null)
  },

  'vault:inspect': async (_ctx, path) => inspectVault(path),

  'vault:initialize': async (_ctx, path, options) => {
    const result = await initVault(assertAbsolutePath(path), {
      allowNonEmpty: options?.allowNonEmpty === true
    })
    await updateSettings({ vaultPath: result.vault.path })
    return result
  },

  'vault:open': async (_ctx, path) => {
    const vault = await inspectVault(path)
    if (vault.state !== 'vault') throw new BrainError('NOT_A_VAULT', '这个文件夹还不是知识库')
    await updateSettings({ vaultPath: vault.path })
    return vault
  },

  'vault:reveal': async () => {
    const { vaultPath } = await getSettings()
    if (!vaultPath) throw new BrainError('NO_VAULT', '还没有选择知识库')
    const error = await shell.openPath(vaultPath)
    if (error) throw new BrainError('INTERNAL', `无法打开文件夹：${error}`)
  }
}

function toErrorPayload(err: unknown): ErrorPayload {
  if (err instanceof BrainError) return { code: err.code, message: err.message }
  const code = (err as NodeJS.ErrnoException)?.code
  if (code === 'EACCES' || code === 'EPERM') {
    return { code: 'PERMISSION_DENIED', message: '没有权限访问这个文件夹，换一个位置试试' }
  }
  console.error('[ipc]', err)
  return { code: 'INTERNAL', message: err instanceof Error ? err.message : String(err) }
}

function isTrustedSender(event: IpcMainInvokeEvent): boolean {
  const url = event.senderFrame?.url
  return url !== undefined && isAppUrl(url)
}

export function registerIpcHandlers(): void {
  for (const channel of Object.keys(handlers) as IpcChannel[]) {
    const handler = handlers[channel] as (ctx: HandlerContext, ...args: unknown[]) => Promise<unknown>
    ipcMain.handle(channel, async (event, ...args): Promise<IpcResult<unknown>> => {
      if (!isTrustedSender(event)) {
        return { ok: false, error: { code: 'FORBIDDEN', message: '拒绝来自未知页面的请求' } }
      }
      try {
        const ctx = { window: BrowserWindow.fromWebContents(event.sender) }
        return { ok: true, data: await handler(ctx, ...args) }
      } catch (err) {
        return { ok: false, error: toErrorPayload(err) }
      }
    })
  }
}
