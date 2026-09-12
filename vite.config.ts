import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * GitHub Pages 项目站点运行在子路径下（https://<用户>.github.io/<仓库名>/），
 * 因此允许通过环境变量 BASE_PATH 覆盖资源基准路径；未设置时保持 './' 相对路径，
 * 这样 CNB 预览、本地预览以及任意静态目录托管都能直接使用。
 */
export default defineConfig({
  plugins: [react()],
  base: process.env.BASE_PATH || './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
  server: {
    port: 5173,
  },
});
