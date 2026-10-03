import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 10_000,
    // 固定时区，保证日期相关测试在任何电脑上结果一致
    env: { TZ: "Australia/Perth" },
  },
});
