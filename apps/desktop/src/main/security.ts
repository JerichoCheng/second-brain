const devServerUrl = process.env['ELECTRON_RENDERER_URL']

/** 是否是应用自己的页面（开发时的 Vite 服务器或打包后的本地文件） */
export function isAppUrl(url: string): boolean {
  try {
    const target = new URL(url)
    if (target.protocol === 'file:') return true
    return devServerUrl !== undefined && target.origin === new URL(devServerUrl).origin
  } catch {
    return false
  }
}
