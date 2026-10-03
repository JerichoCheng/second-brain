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
    reveal: () => call('vault:reveal')
  }
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
