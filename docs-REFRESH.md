# 「一键更新」实现说明

## 约束

本站是**纯静态站点**（方案第 20 / 23 章：无数据库、无服务端、无账号体系），
部署在 GitHub Pages 上。因此「点一下按钮 → 服务端去抓数据 → 返回新数据」
这条路在这个架构下不存在。

## 方案：触发式刷新（Trigger & Poll）

「一键更新」不是让浏览器自己爬数据（浏览器直连第三方站点会被 CORS 拦住，
而且会把用户的 IP 暴露给数据源），而是**触发仓库既有的抓取流水线**，然后轮询结果。

```
用户点「一键更新」
   ↓
① 前端读取 data/live/live-index.json  ← 拿到「上次抓取时间 + 各来源条数」
   ↓
② 前端对比本地缓存，若有更新 → 立即刷新界面（快路径，约 0.1s）
   ↓
③ 若数据已过期（超过 STALE_MINUTES）→ 触发仓库抓取流水线
   ↓
④ 轮询 data/refresh-status.json，直到流水线写入新的 updated_at
   ↓
⑤ 重新拉取 airdrops.json / live-index.json，替换界面数据
```

### 为什么这样设计

| 设计点 | 原因 |
|---|---|
| 浏览器不直接抓第三方站点 | 避免 CORS 失败；避免把用户 IP 暴露给数据源；避免在浏览器里放任何凭据 |
| 走仓库流水线而不是新建服务 | 保持「零服务器」约束；抓取逻辑只有一份，前端与定时任务复用 |
| 轮询 JSON 而不是 WebSocket | 静态托管没有长连接能力；轮询一个静态文件是最朴素也最可靠的做法 |
| 失败时明确告知 | 方案第 28 章：来源失败要向用户透明说明，不假装成功 |

## 触发方式（按可用性依次降级）

1. **CNB 流水线触发**（主路径）
   通过 CNB 的 `api_trigger` 触发仓库抓取流水线。
   凭据来自 CNB 密钥仓库，不落库、不进前端。

2. **GitHub `repository_dispatch`**（备用路径）
   若配置了 GitHub Token，则改用 `repository_dispatch` 事件触发
   `.github/workflows/refresh-data.yml`。

3. **纯前端刷新**（兜底）
   以上都不可用时，退化为「重新拉取远端 JSON」——
   至少能拿到定时任务（每 10 分钟）产出的最新数据。

> 三条路径都不需要用户登录，也不需要用户在浏览器里保存任何密钥。

## 数据新鲜度

- 定时任务：**每 10 分钟**（CNB 流水线 + GitHub Actions 双通道）
- 前端判定：`live-index.updated_at` 超过 `STALE_MINUTES` 即显示「数据已过期」
- 过期时按钮变为高亮，提示用户可手动刷新

## 相关文件

| 文件 | 作用 |
|---|---|
| `data/live/live-index.json` | 各来源上次抓取时间与条数（前端读它判断新鲜度） |
| `data/live/<source>.json` | 各来源归一化条目快照 |
| `data/refresh-status.json` | 最近一次抓取任务的运行状态，供前端轮询 |
| `scripts/refresh.mjs` | 抓取任务入口，产出上述文件 |
| `.github/workflows/refresh-data.yml` | GitHub 侧每 10 分钟抓取 + 自动提交 |
