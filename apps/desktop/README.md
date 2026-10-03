# desktop

第二大脑的桌面应用：Electron + React + TypeScript，用 electron-vite 构建，样式用 Tailwind CSS v4 和 shadcn/ui。

## 运行

依赖在仓库根目录统一安装：

```powershell
# 在仓库根目录
npm install
npm run dev            # 启动应用（热更新）
npm test               # 运行测试
npm run typecheck      # 类型检查
```

第一次启动会让你选择存放知识库的文件夹。建议新建一个空文件夹，放在代码仓库外面，比如 `D:\Brain`。

## 目录

```
src/
├─ main/                 主进程（Node 环境，可以访问文件系统）
│   ├─ index.ts          创建窗口、安全设置
│   ├─ ipc.ts            所有 IPC 处理函数
│   ├─ settings.ts       应用设置（保存在 %APPDATA%\Second Brain\settings.json）
│   ├─ security.ts
│   └─ vault/            知识库服务：检查、初始化、git（不依赖 Electron，可以直接测试）
├─ preload/              通过 contextBridge 暴露 window.brain，只转发白名单通道
├─ shared/               主进程和界面共用：IPC 类型、错误类型、vault 目录结构
└─ renderer/             界面（浏览器环境，不能访问文件系统）
    └─ src/
        ├─ lib/api.ts    界面调用主进程的唯一入口
        ├─ components/   ui/ 下是 shadcn 组件
        └─ pages/
```

## 新增一个 IPC 通道

1. 在 `src/shared/ipc.ts` 的 `IpcContract` 和 `CHANNELS` 里各加一项
2. 在 `src/main/ipc.ts` 的 `handlers` 里实现（漏写会类型报错）
3. 在 `src/renderer/src/lib/api.ts` 里包一个方法

处理函数收到的参数来自界面，要当作不可信输入重新校验，比如路径用 `assertAbsolutePath`。

## 添加 shadcn 组件

```powershell
cd apps\desktop
npx shadcn@latest add dialog
```

组件会放进 `src/renderer/src/components/ui/`，颜色变量已经在 `globals.css` 里定义好。

## 安全设置

- `contextIsolation: true`、`sandbox: true`、`nodeIntegration: false`
- 界面只能通过 `window.brain.invoke` 调用白名单里的通道，主进程还会检查请求是否来自应用自己的页面
- 窗口不允许跳转到外部页面，外部链接用系统浏览器打开
- 页面有 CSP，只允许加载本地脚本
