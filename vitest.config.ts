import { defineConfig } from 'vitest/config'

// 仅覆盖 functions/api/_utils.ts 中的纯函数;测试文件不参与 tsc 构建(tsconfig 只含 src/functions)
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
})
