import { defineConfig } from 'vite'

// GitHub Pages 项目页部署在 /<repo>/ 子路径下，需要设置 base。
// 本地开发时 base 为 '/'，构建时为 '/studio-canvas/'。
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/studio-canvas/' : '/',
}))
