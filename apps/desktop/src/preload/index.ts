import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { isEventChannel, isIpcChannel, type BrainBridge, type IpcResult } from '@shared/ipc'

/**
 * 界面唯一能接触主进程的入口：只转发白名单里的通道。
 * 界面拿不到 ipcRenderer、Node 或文件系统。
 */
const bridge: BrainBridge = {
  invoke: (channel, ...args) => {
    if (!isIpcChannel(channel)) {
      return Promise.resolve({
        ok: false,
        error: { code: 'FORBIDDEN', message: `未知的通道：${String(channel)}` }
      })
    }
    return ipcRenderer.invoke(channel, ...args) as Promise<IpcResult<never>>
  },

  on: (channel, listener) => {
    if (!isEventChannel(channel)) return () => {}
    // 不把 IpcRendererEvent 交给界面，它带着 sender 等对象
    const handler = (_event: IpcRendererEvent, payload: unknown): void => listener(payload as never)
    ipcRenderer.on(channel, handler)
    return () => {
      ipcRenderer.removeListener(channel, handler)
    }
  }
}

contextBridge.exposeInMainWorld('brain', bridge)
