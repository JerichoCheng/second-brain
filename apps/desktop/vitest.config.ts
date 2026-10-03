import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: [
      { find: '@shared', replacement: resolve('src/shared') },
      { find: '@', replacement: resolve('src/renderer/src') },
      { find: /^@second-brain\/vault-core$/, replacement: resolve('../../packages/vault-core/src/index.ts') }
    ]
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    testTimeout: 10_000,
    // 和 vault-core 一样固定时区，日期相关的测试在任何电脑上结果一致
    env: { TZ: 'Australia/Perth' }
  }
})
