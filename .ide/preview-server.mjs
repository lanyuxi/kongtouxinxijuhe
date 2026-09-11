/**
 * DropLens 预览服务器（云原生开发「仅预览模式」专用）
 *
 * 用途：把构建产物 dist/ 以静态站点方式托管，供 CNB 预览页面直接访问。
 *
 * 设计说明：
 *   平台要求业务服务监听 8686 端口。当 `daemon: false`（默认）时，
 *   平台以前台方式执行 launch，并等待其退出后才继续检测端口，
 *   因此这里采用「父进程拉起 detach 子进程 → 父进程退出」的方式：
 *   既能打印启动日志便于排查，又不会阻塞平台流程。
 *
 *   用法：node .ide/preview-server.mjs        # 父进程：拉起子进程后退出
 *        node .ide/preview-server.mjs --serve  # 子进程：真正对外提供服务
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(root, 'dist');
const PORT = 8686;
const HOST = '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

// ---------- 子进程：真正的静态服务 ----------
if (process.argv.includes('--serve')) {
  const server = createServer(async (req, res) => {
    try {
      const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      let filePath = path.join(distDir, urlPath);

      // 防目录穿越
      if (!filePath.startsWith(distDir)) {
        res.writeHead(403).end('Forbidden');
        return;
      }

      let info = await stat(filePath).catch(() => null);
      if (info?.isDirectory()) {
        filePath = path.join(filePath, 'index.html');
        info = await stat(filePath).catch(() => null);
      }
      // SPA 回退：未命中的路径交给 index.html 处理前端路由
      if (!info) {
        filePath = path.join(distDir, 'index.html');
        info = await stat(filePath).catch(() => null);
      }
      if (!info) {
        res.writeHead(404).end('Not Found');
        return;
      }

      const body = await readFile(filePath);
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
      });
      res.end(body);
    } catch (err) {
      res.writeHead(500).end(`Internal Error: ${err.message}`);
    }
  });

  server.listen(PORT, HOST, () => {
    console.log(`[preview] 静态服务已启动：http://${HOST}:${PORT} （目录：dist/）`);
  });
} else {
  // ---------- 父进程：拉起子进程并退出，避免阻塞平台 ----------
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--serve'], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  console.log(`[preview] 已拉起预览服务子进程 pid=${child.pid}`);
  console.log('[preview] 端口 8686 就绪后平台将自动打开预览页面');
  process.exit(0);
}
