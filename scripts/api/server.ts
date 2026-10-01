import { createServer, type IncomingMessage, type Server } from 'node:http';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore, type XStore } from './store';
import { createXService, type XService } from './service';
import { createXClient, readTargets, safeFailure } from './x-client';
import { createXJobs } from './x-jobs';
import type { XReply } from '../../src/lib/x-api-types';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
class RequestError extends Error { constructor(public status: number, message: string) { super(message); } }
async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] ?? '')) throw new RequestError(415, '请使用 JSON 格式提交配置。');
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size <= 8192) chunks.push(Buffer.from(chunk)); }
  if (size > 8192) throw new RequestError(413, '提交内容过长，请只粘贴 Bearer Token。');
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch { throw new RequestError(400, '提交内容无法读取，请重新填写。'); }
}
export function createApiServer(service: XService, store: XStore, options: { origin: string; production: boolean; distDirectory?: string }): Server {
  const server = createServer(async (req, res) => {
    const reply = (status: number, data: XReply<unknown>) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(data));
    };
    try {
      const url = new URL(req.url ?? '/', options.origin);
      if (url.pathname.startsWith('/api/')) {
        const routes = new Set(['/api/x/settings', '/api/x/test', '/api/x/refresh', '/api/x/result']);
        if (!routes.has(url.pathname)) throw new RequestError(404, '接口不存在。');
        if (url.search) throw new RequestError(400, '接口不接受访客身份或额外参数。');
        const mutating = req.method !== 'GET';
        if (mutating && req.headers.origin !== options.origin) throw new RequestError(403, '请求来源不匹配，请在网站设置页面操作。');
        let input: Record<string, unknown> = {};
        if (mutating) {
          input = await body(req);
          const allowed = req.method === 'POST' && url.pathname === '/api/x/settings' ? ['token'] : [];
          if (Object.keys(input).some(k => !allowed.includes(k))) throw new RequestError(400, '请只提交当前页面要求的配置内容。');
        }
        const session = await store.resolveSession(req.headers.cookie);
        res.setHeader('Set-Cookie', session.setCookie + (options.production ? '; Secure' : ''));
        let result: unknown;
        if (url.pathname === '/api/x/settings' && req.method === 'GET') result = await service.settings(session.id);
        else if (url.pathname === '/api/x/settings' && req.method === 'POST') {
          if (typeof input.token !== 'string') throw new RequestError(400, '请填写 Bearer Token。');
          result = await service.save(session.id, input.token);
        } else if (url.pathname === '/api/x/settings' && req.method === 'DELETE') { await service.remove(session.id); result = null; }
        else if (url.pathname === '/api/x/test' && req.method === 'POST') result = await service.test(session.id);
        else if (url.pathname === '/api/x/refresh' && req.method === 'POST') result = await service.refresh(session.id);
        else if (url.pathname === '/api/x/result' && req.method === 'GET') result = await service.result(session.id);
        else throw new RequestError(405, '此接口不支持该操作。');
        reply(200, { ok: true, data: result }); return;
      }
      if (!options.distDirectory || !['GET', 'HEAD'].includes(req.method ?? '')) { res.writeHead(404); res.end(); return; }
      const decoded = decodeURIComponent((req.url ?? '/').split('?')[0]);
      if (decoded.startsWith('/@fs/') || decoded.split(/[\\/]/).some(s => s === '..' || s.startsWith('.')) || decoded.includes('\\')) { res.writeHead(403); res.end(); return; }
      const dir = path.resolve(options.distDirectory); const target = path.resolve(dir, '.' + decoded);
      if (!target.startsWith(dir + path.sep) && target !== dir) { res.writeHead(403); res.end(); return; }
      let file = target;
      try { if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html'); }
      catch { if (path.extname(decoded) || decoded.startsWith('/data/') || decoded.startsWith('/assets/')) { res.writeHead(404); res.end(); return; } file = path.join(dir, 'index.html'); }
      const extension = path.extname(file); const types: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.xml': 'application/xml' };
      const content = await readFile(file); res.writeHead(200, { 'Content-Type': types[extension] ?? 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache' }); res.end(req.method === 'HEAD' ? undefined : content);
    } catch (e) {
      if (e instanceof RequestError) reply(e.status, { ok: false, error: { code: e.status === 403 ? 'forbidden' : 'invalid_input', message: e.message } });
      else {
        const error = safeFailure(e); const status = error.code === 'rate_limit' ? 429 : error.code === 'busy' ? 503 : error.code === 'interrupted' ? 409 : 400;
        reply(status, { ok: false, error });
      }
    }
  });
  server.requestTimeout = 30_000;
  return server;
}

export async function startServer(): Promise<Server> {
  const production = process.argv.includes('--production');
  const origin = process.env.PUBLIC_ORIGIN ?? 'http://127.0.0.1:5173';
  if (new URL(origin).origin !== origin || (production && !origin.startsWith('https://'))) throw new Error('PUBLIC_ORIGIN 必须是网站的完整来源地址，生产环境需要 HTTPS。');
  const directory = path.join(ROOT, '.private/x'); await mkdir(directory, { recursive: true, mode: 0o700 });
  let key: Buffer;
  if (process.env.X_CONFIG_MASTER_KEY) key = Buffer.from(process.env.X_CONFIG_MASTER_KEY, 'base64');
  else {
    if (production) throw new Error('生产环境必须配置 X_CONFIG_MASTER_KEY，不能使用开发密钥。');
    const file = path.join(directory, 'master.key');
    try { key = await readFile(file); }
    catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      key = randomBytes(32); await writeFile(file, key, { mode: 0o600, flag: 'wx' });
    }
  }
  if (key.length !== 32) throw new Error('X_CONFIG_MASTER_KEY 解码后必须为 32 字节。');
  const store = await createStore(path.join(directory, 'visitors'), key);
  await store.cleanupExpired();
  const client = createXClient(); const targets = readTargets();
  const service = createXService(store, client, targets);
  const jobs = createXJobs(store, client, targets); await jobs.recover(); service.setJobs(jobs);
  const server = createApiServer(service, store, { origin, production, distDirectory: production ? path.join(ROOT, 'dist') : undefined });
  const cleanup = setInterval(() => { store.cleanupExpired().catch(() => {}); }, 3600_000); cleanup.unref();
  server.once('close', () => clearInterval(cleanup));
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(Number(process.env.PORT ?? (production ? 3000 : 5174)), process.env.HOST ?? '127.0.0.1', resolve); });
  console.log(`X 配置后台已启动（${production ? '生产' : '本地'}模式）`);
  return server;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startServer().catch(() => { console.error('后台启动失败：请检查端口、主密钥和 PUBLIC_ORIGIN 配置。'); process.exitCode = 1; });
}
