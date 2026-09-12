/**
 * DropLens 预览服务器（云原生开发「仅预览模式」专用）
 *
 * 用途：把构建产物 dist/ 以静态站点方式托管，供 CNB 预览页面直接访问。
 *
 * 平台约定（见 https://docs.cnb.cool/zh/workspaces/only-preview.md）：
 *   1. 业务服务必须监听在 8686 端口；
 *   2. `daemon: false`（默认）时平台以「前台」方式执行 launch，
 *      并等待 launch 主动退出后才开始检测 8686 端口；
 *   3. launch 要么把服务转入后台后自行退出，要么保持前台常驻。
 *
 * 本脚本采用「前台守护模式」：它自己就是业务进程，直接监听 8686 并常驻，
 * 不自旋 spawn 子进程。原因：
 *   - 早先的实现用 `spawn(detached) + parent.exit(0)`，父进程一退出，
 *     平台立刻开始轮询端口，而子进程可能还没 listen 完成；一旦子进程启动
 *     失败（例如 dist/ 缺失），错误还会被 stdio:'ignore' 完全吞掉，
 *     最终表现就是「预览页面能打开，但每个请求都 404 / 打不开」。
 *   - 前台常驻则日志直达平台，端口就绪时机明确，不会再出现这类竞态。
 *
 * 为兼容 `daemon: false`（平台等待 launch 退出）的语义，脚本还支持
 * `--background` 参数：确认端口就绪后再将自身转入后台并与父进程脱离。
 *
 * 用法：
 *   node .ide/preview-server.mjs                 # 前台常驻（推荐，日志可见）
 *   node .ide/preview-server.mjs --background    # 就绪后转后台并退出父进程
 */

import { createServer } from 'node:http';
import { readFile, stat, access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const distDir = path.join(root, 'dist');
const indexPath = path.join(distDir, 'index.html');
const PORT = Number(process.env.PREVIEW_PORT || 8686);
const HOST = '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

/** 检查 dist/ 是否已就绪，未就绪时给出可操作的提示。 */
async function assertDistReady() {
  try {
    await access(indexPath);
  } catch {
    const hint = [
      `[preview] ✗ 构建产物缺失：${indexPath}`,
      '[preview]   预览服务需要先执行构建才能提供页面。请确认：',
      '[preview]   1) 已执行 `npm run build`（会同时执行 npm run sync-data）；',
      '[preview]   2) .cnb.yml 的 vscode 配置中 stages 内的构建步骤已成功完成。',
      '[preview]   提示：dist/ 属于构建产物（已在 .gitignore 中忽略），',
      '[preview]   不会随仓库下发，必须由构建步骤现场生成。',
    ].join('\n');
    console.error(hint);
    process.exit(1);
  }
}

/** 解析请求路径，安全地映射到 dist/ 内的真实文件。 */
async function resolveFile(urlPath) {
  // 目录穿越防护（两道）：
  //   1) 显式识别路径中的 '..' 片段 → 直接 403，语义清晰；
  //   2) 再用 resolve 后的绝对路径做边界兜底（防 symlink 之外的拼接歧义）。
  // 注意：不能只用字符串前缀判断 —— path.join 会折叠 '..'，
  // 早先实现因此让 /../package.json 逃逸出 dist/（虽有兜底但语义错误）。
  const rawSegments = urlPath.split(/[\\/]+/);
  if (rawSegments.includes('..')) {
    return { error: 403 };
  }

  const normalized = path.posix.normalize(urlPath);
  const rel = normalized.replace(/^\/+/, '');
  const filePath = path.resolve(distDir, rel);

  if (filePath !== distDir && !filePath.startsWith(distDir + path.sep)) {
    return { error: 403 };
  }

  let info = await stat(filePath).catch(() => null);

  // 目录请求 → 尝试目录下的 index.html
  if (info?.isDirectory()) {
    const nested = path.join(filePath, 'index.html');
    info = await stat(nested).catch(() => null);
    if (info) return { filePath: nested };
  } else if (info?.isFile()) {
    return { filePath };
  }

  // 未命中：仅「页面级」请求才回退 index.html。
  // 静态资源（带扩展名，如 .js/.css/.png）与 data/ 下缺失的文件必须真实 404，
  // 否则会把「资源加载失败」伪装成 200 HTML，导致前端白屏且难以排查。
  const isAssetLike =
    path.posix.extname(rel) !== '' || rel.startsWith('assets/') || rel.startsWith('data/');

  if (!isAssetLike) {
    const fallback = await stat(indexPath).catch(() => null);
    if (fallback) return { filePath: indexPath, fallback: true };
  }

  return { error: 404 };
}

function createStaticServer() {
  return createServer(async (req, res) => {
    const started = Date.now();
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { Allow: 'GET, HEAD' }).end('Method Not Allowed');
        return;
      }

      // 只取路径部分，并做百分号解码
      let urlPath = (req.url || '/').split('?')[0].split('#')[0];
      try {
        urlPath = decodeURIComponent(urlPath);
      } catch {
        res.writeHead(400).end('Bad Request: malformed URL encoding');
        return;
      }
      // 拒绝解码后残留的空字节
      if (urlPath.includes('\0')) {
        res.writeHead(400).end('Bad Request');
        return;
      }

      const resolved = await resolveFile(urlPath);

      if (resolved.error === 403) {
        console.warn(`[preview] 403 ${req.method} ${urlPath}（越界路径已拦截）`);
        res.writeHead(403).end('Forbidden');
        return;
      }
      if (resolved.error === 404) {
        console.warn(`[preview] 404 ${req.method} ${urlPath}`);
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
          .end('Not Found');
        return;
      }

      const body = await readFile(resolved.filePath);
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(resolved.filePath).toLowerCase()] || 'application/octet-stream',
        'Content-Length': body.length,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      if (req.method === 'HEAD') res.end();
      else res.end(body);
      // 日志直达平台，便于排查（原实现被 stdio:'ignore' 吞掉了）
      console.log(
        `[preview] 200 ${req.method} ${urlPath} → ${path.relative(distDir, resolved.filePath)} (${Date.now() - started}ms)`,
      );
    } catch (err) {
      console.error(`[preview] 500 ${req.method} ${req.url}：${err.stack || err.message}`);
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
        .end(`Internal Error: ${err.message}`);
    }
  });
}

/** 轮询端口，直到可建立 TCP 连接（或超时）。 */
async function waitForPort(timeoutMs = 30_000, intervalMs = 200) {
  const net = await import('node:net');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ok = await new Promise((resolve) => {
      const socket = net.connect({ port: PORT, host: '127.0.0.1' });
      socket.once('connect', () => { socket.destroy(); resolve(true); });
      socket.once('error', () => { socket.destroy(); resolve(false); });
    });
    if (ok) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

// ---------- --child：后台常驻进程（由 --background 拉起） ----------
if (process.argv.includes('--child')) {
  await startServer();
}
// ---------- --background：前台启动 → 确认就绪 → 转入后台 → 父进程退出 ----------
else if (process.argv.includes('--background')) {
  const child = spawn(
    process.execPath,
    [fileURLToPath(import.meta.url), '--child'],
    { detached: true, stdio: ['ignore', 'inherit', 'inherit'] },
  );

  const ready = await waitForPort();
  child.unref();

  if (!ready) {
    console.error(`[preview] ✗ 端口 ${PORT} 在超时内未就绪，请检查上方日志`);
    process.exit(1);
  }
  console.log(`[preview] ✓ 端口 ${PORT} 已就绪，预览服务转入后台（pid=${child.pid}）`);
  process.exit(0);
}
// ---------- 默认：前台常驻（平台以 daemon:false 前台执行，日志直达） ----------
else {
  await startServer();
}

async function startServer() {
  await assertDistReady();

  const server = createStaticServer();

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[preview] ✗ 端口 ${PORT} 已被占用，无法启动预览服务`);
      // 端口上已有服务在监听时，平台仍会打开预览页；此处直接以非 0 退出暴露问题
      process.exit(1);
    }
    console.error(`[preview] ✗ 服务启动失败：${err.stack || err.message}`);
    process.exit(1);
  });

  await new Promise((resolve) => {
    server.listen(PORT, HOST, () => {
      console.log(`[preview] ✓ 静态服务已启动 http://${HOST}:${PORT}（目录：${distDir}）`);
      resolve();
    });
  });

  // 自检：确认真的能返回首页，避免「端口通但页面 404」的假就绪
  const probe = await fetch(`http://127.0.0.1:${PORT}/`).catch(() => null);
  if (!probe || probe.status !== 200) {
    console.error(
      `[preview] ✗ 自检失败：GET / 返回 ${probe ? probe.status : '无响应'}，预览服务不可用`,
    );
    process.exit(1);
  }
  console.log('[preview] ✓ 自检通过：GET / 返回 200，平台即将打开预览页面');

  const shutdown = () => {
    console.log('[preview] 收到退出信号，正在关闭预览服务…');
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
