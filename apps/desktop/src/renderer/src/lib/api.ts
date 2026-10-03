import type { VaultChange, ViewDef } from '@shared/db'
import { BrainError } from '@shared/errors'
import type { InitOptions, IpcArgs, IpcChannel, IpcReturn } from '@shared/ipc'

async function call<C extends IpcChannel>(channel: C, ...args: IpcArgs<C>): Promise<IpcReturn<C>> {
  const result = await window.brain.invoke(channel, ...args)
  if (result.ok) return result.data
  throw new BrainError(result.error.code, result.error.message)
}

/** 界面访问主进程的全部方法 */
export const api = {
  app: {
    info: () => call('app:info')
  },
  vault: {
    current: () => call('vault:current'),
    pickFolder: () => call('vault:pick-folder'),
    inspect: (path: string) => call('vault:inspect', path),
    initialize: (path: string, options: InitOptions = {}) => call('vault:initialize', path, options),
    open: (path: string) => call('vault:open', path),
    reveal: () => call('vault:reveal'),
    /** 订阅数据变化（外部编辑和界面自己的修改），返回取消订阅的函数 */
    onChange: (listener: (change: VaultChange) => void) => window.brain.on('vault:changed', listener)
  },
  db: {
    schemas: () => call('db:schemas'),
    query: (db: string, view: ViewDef) => call('db:query', db, view),
    names: (db: string) => call('db:names', db),
    saveView: (db: string, view: ViewDef, replace?: string) => call('db:save-view', db, view, replace),
    deleteView: (db: string, name: string) => call('db:delete-view', db, name)
  },
  entry: {
    /** path 也可以是页面名 */
    get: (path: string) => call('entry:get', path),
    create: (db: string, title: string, fields: Record<string, unknown> = {}) =>
      call('entry:create', db, title, fields),
    update: (path: string, patch: Record<string, unknown>) => call('entry:update', path, patch),
    rename: (path: string, title: string) => call('entry:rename', path, title),
    remove: (path: string) => call('entry:remove', path),
    openExternal: (path: string) => call('entry:open-external', path)
  }
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
