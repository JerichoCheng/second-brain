import { readFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { app } from 'electron'
import type { AppSettings } from '@shared/ipc'
import { atomicWrite } from './vault/fs'

const DEFAULTS: AppSettings = { vaultPath: null }

let cache: AppSettings | null = null

function settingsFile(): string {
  return join(app.getPath('userData'), 'settings.json')
}

function sanitize(raw: unknown): AppSettings {
  const value = (raw ?? {}) as Partial<AppSettings>
  return {
    vaultPath:
      typeof value.vaultPath === 'string' && isAbsolute(value.vaultPath) ? value.vaultPath : DEFAULTS.vaultPath
  }
}

export async function getSettings(): Promise<AppSettings> {
  if (cache) return cache
  try {
    cache = sanitize(JSON.parse(await readFile(settingsFile(), 'utf8')))
  } catch {
    // 第一次启动或文件损坏时用默认值
    cache = { ...DEFAULTS }
  }
  return cache
}

export async function updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const next = sanitize({ ...(await getSettings()), ...patch })
  await atomicWrite(settingsFile(), JSON.stringify(next, null, 2) + '\n')
  cache = next
  return next
}
