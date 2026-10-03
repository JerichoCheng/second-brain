import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const shared = resolve('src/shared')

export default defineConfig({
  main: {
    resolve: {
      alias: [
        { find: '@shared', replacement: shared },
        // 直接打包 vault-core 的源码，开发时不需要先构建它
        { find: /^@second-brain\/vault-core$/, replacement: resolve('../../packages/vault-core/src/index.ts') }
      ]
    }
  },
  preload: {
    resolve: { alias: { '@shared': shared } }
  },
  renderer: {
    resolve: {
      alias: {
        '@': resolve('src/renderer/src'),
        '@shared': shared
      }
    },
    plugins: [react(), tailwindcss()]
  }
})
