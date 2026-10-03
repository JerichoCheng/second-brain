import { join } from 'node:path'
import { app, BrowserWindow, nativeTheme, shell } from 'electron'
import { db, registerIpcHandlers } from './ipc'
import { isAppUrl } from './security'

// 开发时可以换一份应用设置（比如指向测试用的知识库），不影响平时用的那份
const devUserData = process.env['SECOND_BRAIN_USER_DATA']
if (!app.isPackaged && devUserData) app.setPath('userData', devUserData)

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 860,
    minHeight: 560,
    show: false,
    title: 'Second Brain',
    autoHideMenuBar: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#18191b' : '#ffffff',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false
    }
  })

  window.once('ready-to-show', () => window.show())

  const devServerUrl = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devServerUrl) {
    void window.loadURL(devServerUrl)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// 外部链接用系统浏览器打开；应用窗口不允许跳转到其他页面
app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  contents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) event.preventDefault()
  })
})

app.whenReady().then(() => {
  app.setAppUserModelId('com.jerichocheng.secondbrain')
  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('will-quit', () => {
  void db.close()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
