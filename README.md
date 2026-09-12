<div align="center">

# DropLens · 空投雷达与决策助手

**看清每一个空投，而不是盲目参与。**

聚合空投线索 → 交叉验证来源 → 评估真实性与风险 → 生成可执行教程

[![Deploy to GitHub Pages](https://github.com/lanyuxi/kongtouxinxijuhe/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/lanyuxi/kongtouxinxijuhe/actions/workflows/deploy-pages.yml)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![React](https://img.shields.io/badge/React-18-61dafb.svg)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178c6.svg)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-5-646cff.svg)](https://vitejs.dev)

[在线预览](#在线预览) · [快速开始](#快速开始) · [数据流水线](#数据流水线) · [评分模型](#评分模型) · [部署](#部署) · [常见问题](#常见问题)

</div>

---

## 目录

- [这是什么](#这是什么)
- [在线预览](#在线预览)
- [核心特性](#核心特性)
- [它回答哪 4 个问题](#它回答哪-4-个问题)
- [截图与界面说明](#截图与界面说明)
- [技术栈](#技术栈)
- [目录结构](#目录结构)
- [快速开始](#快速开始)
- [可用命令](#可用命令)
- [数据流水线](#数据流水线)
- [评分模型](#评分模型)
- [核心不变量](#核心不变量)
- [自动化](#自动化)
- [部署](#部署)
- [配置项](#配置项)
- [常见问题](#常见问题)
- [明确不做](#明确不做)
- [安全说明](#安全说明)
- [贡献](#贡献)
- [免责声明](#免责声明)
- [License](#license)

---

## 这是什么

DropLens 是一个面向空投新手的**轻量情报与决策工具**。

它把散落在各处的空投信息聚合起来，**交叉验证**后给出三套互相独立、且每一项都能解释「为什么是这个分数」的评估：

- **真实性置信度** —— 这个项目是真的假的，证据够不够
- **风险等级** —— 有没有一票否决级别的危险信号
- **参与价值** —— 值不值得投入时间、Gas 和资金

并且，对值得做的项目，它会生成一份**可勾选的分步教程**，告诉你下一步具体怎么操作。

> ⚠️ 它**不是**「自动撸空投」工具。没有钱包托管、没有自动签名、没有自动交易、没有批量交互。

### 项目定位

```text
DropLens  =  空投信息聚合  +  证据交叉验证  +  可解释评分  +  新手教程
             ↑ 只做「帮你想清楚」        ↑ 不做「替你动手」
```

---

## 在线预览

### GitHub Pages（固定公网地址，可对外分享）

推送到 `main` 分支后，GitHub Actions 会自动构建并发布：

**👉 https://lanyuxi.github.io/kongtouxinxijuhe/**

该地址由 [`.github/workflows/deploy-pages.yml`](./.github/workflows/deploy-pages.yml) 自动维护，每次 `main` 分支有提交都会重新构建并部署。

### CNB 云原生开发预览

在 CNB 仓库页面点击右上角 **「云原生开发」** 按钮，平台会自动完成 `安装依赖 → 抓取数据 → 构建 → 启动静态服务`，然后直接打开站点预览页面。

- 闲置 30 分钟自动回收，再次点击即可重新拉起
- 配置见 [`.cnb.yml`](./.cnb.yml) 的 `$:` 段与 [`.ide/preview-server.mjs`](./.ide/preview-server.mjs)

### 本地预览

```bash
npm install
npm run dev      # http://localhost:5173
```

---

## 核心特性

### 数据与评估

- **三套独立评分，不合成总分** —— 真实性 / 风险 / 参与价值互不折算，避免"高分掩盖高风险"
- **每个评分可解释** —— 每一项得分都附带中文理由与证据链接，拒绝孤立的数字
- **证据交叉验证** —— 第三方页面提供的链接**不会**被自动当作官方链接
- **一票否决机制** —— 索取私钥 / 助记词 / Keystore、要求向个人地址转账等行为，直接判为极高风险，且**永不推荐参与**
- **数据源故障隔离** —— 单个来源抓取失败不会清空已有数据，自动保留 Last Known Good，并在前端透明提示
- **拒绝空数据发布** —— 校验不通过时拒绝写入，避免污染线上内容

### 前端体验

- **全站简体中文 + 浅色主题** —— 无深色背景，无成片英文 UI
- **响应式布局** —— 手机 / 平板 / 桌面自适应
- **搜索与多维筛选** —— 状态、公链、类型、风险、成本
- **5 种排序方式** —— 最新 / 价值 / 真实性 / 风险 / 领取截止
- **详情页 11 个板块** —— 系统结论、评分明细（可展开）、证据清单、成本模型、分步教程（可勾选）、FAQ、官方资料、问题反馈
- **本地收藏与进度** —— 仅使用浏览器 LocalStorage，不上传任何用户数据

### 工程与交付

- **零服务器、零数据库** —— 纯静态站点，数据以 JSON 随仓库发布
- **零运行时密钥** —— 浏览器端不出现任何 API Secret，构建产物会做密钥扫描
- **确定性与可测试** —— 教程由确定性模板 + 官方 JSON-LD 生成，非运行时 LLM 调用；31 个单测覆盖 7 条核心不变量
- **双平台自动化** —— CNB 定时抓取数据，GitHub Actions 部署 Pages

---

## 它回答哪 4 个问题

| # | 问题 | 对应能力 |
|---|---|---|
| 1 | 最近有什么新的空投机会？ | 多源定时抓取 + 按状态/时间/公链筛选 |
| 2 | 这个项目是真的假的、可信度怎么样？ | 8 项证据加权 → 真实性置信度（0–100） |
| 3 | 值不值得我投入时间、Gas 和资金？ | 风险等级 + 七维参与价值 + 成本模型 |
| 4 | 如果值得做，我下一步具体怎么操作？ | 分步骤教程（含耗时/费用/风险/完成标准/来源） |

---

## 截图与界面说明

### 首页 · 列表视图

- 顶部：搜索框 + 数据更新时间 + 数据源健康状态提示
- 筛选栏：状态 / 公链 / 类型 / 风险 / 成本
- 排序：最新 · 价值 · 真实性 · 风险 · 领取截止
- 卡片：项目名、一句话介绍、状态徽章、风险徽章、三套评分、成本星级 → 点击进入详情

### 详情页 · 11 个板块

| 板块 | 内容 |
|---|---|
| 1. 概要 | 项目名、分类、公链、状态、一句话介绍 |
| 2. 系统结论 | 一句话结论（风险为 critical 时强制"不建议参与"） |
| 3. 三项评分 | 真实性 / 风险 / 价值，均可展开查看明细与理由 |
| 4. 证据清单 | 每条证据的核查状态与来源链接 |
| 5. 官方资料 | 官网 / X / Docs / GitHub / Discord / Galxe |
| 6. 项目背景 | 融资、投资方、代币状态、空投状态 |
| 7. 成本模型 | 资金 / Gas / 时间 / 难度 / 参与要求 |
| 8. 分步教程 | 每步含耗时、费用、风险、完成标准、来源，可勾选 |
| 9. 常见问题 | 基于模板 + 官方 FAQ 生成 |
| 10. 数据来源 | 所有来源及其抓取时间 |
| 11. 问题反馈 | 引导用户核对信息 |

### 我的关注

- 收藏项目、参与进度、教程步骤勾选状态
- 全部存储在浏览器 LocalStorage，**不上传服务器**

---

## 技术栈

| 层 | 选型 |
|---|---|
| 前端框架 | React 18 + TypeScript 5.6 |
| 构建工具 | Vite 5 |
| 样式 | Tailwind CSS 3（浅色主题） |
| 路由 | 自研 hash 路由（零依赖，纯静态友好） |
| 数据 | 静态 JSON（随仓库发布） |
| 数据处理 | Node.js + tsx（纯函数引擎） |
| 用户状态 | LocalStorage |
| 测试 | Vitest |
| 定时抓取 | CNB 流水线（每 3 小时） |
| 静态部署 | GitHub Actions → GitHub Pages |
| 开发预览 | CNB 云原生开发「仅预览模式」 |

---

## 目录结构

```text
.
├── .github/workflows/
│   └── deploy-pages.yml       # GitHub Actions：构建 + 部署到 GitHub Pages
├── .cnb.yml                   # CNB 流水线：定时抓取 + 构建校验 + 预览
├── .ide/
│   └── preview-server.mjs     # CNB 云原生开发预览用静态服务器（零依赖）
├── index.html                 # 站点入口
├── vite.config.ts             # 支持 BASE_PATH 覆盖资源基准路径
├── tailwind.config.js         # 浅色主题令牌
├── tsconfig.json
├── src/                       # 前端
│   ├── main.tsx               # 挂载入口
│   ├── App.tsx                # 路由编排与数据加载
│   ├── components/            # Badge / FilterBar / Layout / ProjectCard / ScoreCard / StatBar
│   ├── pages/                 # ListView / DetailView
│   ├── lib/                   # data / filter / labels / router / store / types
│   └── styles/                # Tailwind 入口与主题变量
├── scripts/                   # 数据处理（Node.js）
│   ├── pipeline.ts            # 流水线主入口
│   ├── validate.ts            # 独立校验脚本（可作 CI 门禁）
│   ├── sync-data.mjs          # 产物数据同步到 public/
│   ├── fetch/                 # 数据源适配器（每个来源独立、可失败）
│   │   ├── index.ts
│   │   ├── airdrops-io.ts     # Airdrops.io 分类页 + JSON-LD
│   │   ├── defillama.ts       # DefiLlama Rewards
│   │   └── galxe.ts           # Galxe 任务平台
│   └── lib/                   # 核心引擎
│       ├── normalize.ts       # 结构归一
│       ├── merge.ts           # 去重 / 合并 / Last Known Good
│       ├── verify.ts          # 证据收集与交叉验证
│       ├── enrich.ts          # 官方档案补全
│       ├── score.ts           # 真实性 / 风险 / 价值评分
│       ├── guide.ts           # 教程 + FAQ 生成
│       └── validate.ts        # 发布前校验 + Secret 扫描
├── data/                      # 数据（产物 + 人工维护输入）
│   ├── airdrops.json          # 列表数据（产物）
│   ├── source-health.json     # 数据源健康状态（产物）
│   ├── details/*.json         # 项目详情分片（产物）
│   └── seed/                  # 人工维护的输入数据
│       ├── airdrops-io.json
│       ├── defillama.json
│       ├── galxe.json
│       └── official-profiles.json   # 官方链接档案（唯一可信官方来源）
├── public/                    # 静态资源（favicon 等）
└── tests/                     # 引擎单测
    ├── engine.test.ts         # 21 项：评分 / 风险 / 校验 / 不变量
    └── preview-server.test.ts # 10 项：预览服务器路由与安全
```

---

## 快速开始

### 环境要求

| 依赖 | 版本 |
|---|---|
| Node.js | ≥ 20（推荐 22） |
| npm | ≥ 10 |

### 步骤

```bash
# 1) 克隆仓库
git clone https://github.com/lanyuxi/kongtouxinxijuhe.git
cd kongtouxinxijuhe

# 2) 安装依赖
npm install

# 3) 生成数据（抓取 → 归一 → 合并 → 验证 → 评分 → 教程 → 校验）
npm run pipeline

# 4) 本地开发（自动先跑一次数据同步）
npm run dev
# → http://localhost:5173

# 5) 构建静态站点
npm run build
# → 产物在 dist/

# 6) 本地预览构建产物
npm run preview

# 7) 测试与校验
npm test
npm run validate
```

---

## 可用命令

| 命令 | 作用 |
|---|---|
| `npm run dev` | 同步数据 + 启动 Vite 开发服务器（http://localhost:5173） |
| `npm run build` | 同步数据 + TypeScript 编译 + Vite 构建到 `dist/` |
| `npm run preview` | 用 Vite 预览 `dist/` 构建产物 |
| `npm run pipeline` | 跑一次完整数据流水线，写出 `data/*.json` |
| `npm run sync-data` | 把 `data/` 的产物 JSON 复制到 `public/data/` |
| `npm test` | Vitest 跑全部单测 |
| `npm run validate` | 发布前校验 + Secret 扫描（可作为 CI 门禁） |

### 环境变量

| 变量 | 作用 | 默认 |
|---|---|---|
| `BASE_PATH` | 覆盖 Vite 资源基准路径，用于子路径部署 | `./` |
| `PREVIEW_PORT` | CNB 预览服务器端口 | `8686` |

---

## 数据流水线

```text
数据源适配器（独立运行 + 故障隔离）
   ↓
Normalize        结构归一
   ↓
Merge            按 slug 去重；保留上一版数据（Last Known Good）
   ↓
Verify           证据收集；第三方链接需交叉验证才可信
   ↓
Enrich           用人工核实的官方档案补全官方链接
   ↓
Score            真实性置信度 / 风险 / 参与价值
   ↓
Guide            分步骤教程 + FAQ（模板化 + 官方 JSON-LD，来源可追溯）
   ↓
Validate         不通过则拒绝写入，避免污染线上数据
   ↓
Write JSON       airdrops.json + details/*.json + source-health.json
```

### 数据源

| 来源 | 类型 | 说明 |
|---|---|---|
| [Airdrops.io](https://airdrops.io) | 聚合站 | 抓取「最新 / 已确认 / 潜在 / 可领取」分类页与详情页 JSON-LD（含 HowTo 步骤与 FAQ） |
| [DefiLlama Rewards](https://defillama.com/rewards) | 奖励追踪 | 协议 API，用于第三方交叉验证 |
| [Galxe](https://galxe.com) | 任务平台 | 页面为客户端渲染，解析失败会自动降级并记入 `source-health.json` |

**故障隔离行为**：任一来源失败时，该来源标记为 `ok: false` 并写入 `source-health.json`，其余来源继续执行；数据集不会因单源失败而被清空。

### 数据文件说明

| 文件 | 类型 | 说明 |
|---|---|---|
| `data/airdrops.json` | 产物 | 列表数据（含三套评分与证据） |
| `data/details/*.json` | 产物 | 每个项目的详情分片 |
| `data/source-health.json` | 产物 | 各数据源健康状态与最后成功时间 |
| `data/seed/official-profiles.json` | 输入 | **唯一可信的官方链接来源**，人工维护 |
| `data/seed/*.json` | 输入 | 各来源的人工快照（抓取失败时兜底） |

> `data/seed/` 不会被打包进前端产物，只同步 `airdrops.json` / `source-health.json` / `details/`。

---

## 评分模型

### 真实性置信度（满分 100）

| 证据项 | 分值 |
|---|---:|
| 官方网站可验证 | 15 |
| 官方公告明确提到活动 | 20 |
| 官网 ↔ X ↔ Docs 链接可互相印证 | 15 |
| 至少两个独立第三方来源 | 15 |
| Galxe / Layer3 等官方 Space 可确认 | 10 |
| 官方 GitHub / Docs 有持续活动 | 10 |
| 团队 / 投资信息可核实 | 10 |
| 合约地址在区块浏览器可验证 | 5 |

### 风险等级

`low` → `medium` → `high` → `critical`

命中一票否决规则直接判为 `critical`：

- 要求输入助记词 / 私钥 / Keystore
- 要求向个人地址转账
- 要求导出钱包文件
- 诱导关闭安全设置等

> **风险为 `critical` 时，无论价值多少，一律显示「不建议参与」。**

### 参与价值（满分 100）

| 维度 | 分值 |
|---|---:|
| 项目基本面 | 20 |
| 融资情况 | 15 |
| 活跃度 | 15 |
| 信号强度 | 20 |
| 投入产出比 | 15 |
| 时机 | 10 |
| 稀释风险 | 5 |

等级：`85+ S` / `70+ A` / `55+ B` / `40+ C` / 其余 `D`

### 为什么不合成总分

三套评分**刻意不合成一个总分**：

- 真实性 90 分 + 风险 critical，合成分数可能依然「看起来不错」，会误导用户
- 价值高 ≠ 安全，安全性 ≠ 值得做，这是两个独立判断
- 用户可以按自己的偏好在乎不同的维度

---

## 核心不变量

实现与校验均围绕以下不变量，任何改动不得违反：

1. 没有证据的项目不能显示为「已验证」
2. 任何评分必须能解释「为什么得到这个分数」
3. 一个数据源抓取失败，不能导致整个空投库被清空
4. 第三方页面提供的链接，不能自动被认为是官方链接
5. 浏览器端永远不能出现 API Secret
6. 任何页面不得要求用户输入助记词 / 私钥
7. 系统只能表达证据置信度 / 风险评估 / 参与价值，不得承诺收益或安全性

这些不变量由 `npm test`（31 个单测）与 `npm run validate` 共同保障。

---

## 自动化

### CNB 流水线

| 触发 | 行为 |
|---|---|
| `crontab: 17 */3 * * *` | 每 3 小时抓取数据 → 测试 → 校验 → 数据有变化则提交回仓库 |
| `push` (main) | 安装 → 生成数据 → 测试 → 校验 → 构建 → 发布 Release |
| `pull_request` | 安装 → 生成数据 → 测试 → 校验 → 构建 |
| 云原生开发 | 安装 → 生成数据 → 构建 → 启动预览服务（`onlyPreview: true`） |

定时任务刻意避开整点（每 3 小时的 `:17`），减少任务集中。

### GitHub Actions

| 触发 | 行为 |
|---|---|
| `push` (main / master) | 安装 → 生成数据 → 测试 → 校验 → 构建 → 发布到 GitHub Pages |
| `workflow_dispatch` | 手动触发一次完整构建与部署 |

### CNB → GitHub 自动同步

CNB 侧 `main` 分支的 `push` 事件里有一条 **「同步到 GitHub」** 流水线，
负责把代码推送到 GitHub，从而触发上面的 Pages 部署。

- 触发条件：CNB `main` 分支有推送（含 PR 合并产生的推送、定时抓取提交的数据）
- 令牌来源：**CNB 密钥仓库** [`xixi2060/mimacangku`](https://cnb.cool/xixi2060/mimacangku) 的 `github.yml`
  （通过 `.cnb.yml` 的 `imports` 注入为环境变量 `GITHUB_TOKEN`，**不落库、不写死在配置里**）
- 失败处理：令牌缺失时该流水线会明确报错并中断，不会静默失败

> GitHub 令牌只需 `Contents: Read and write` 权限。
> 如果不再需要同步，删除 `.cnb.yml` 里的「同步到 GitHub」流水线即可。

---

## 部署

### GitHub Pages（推荐，固定公网地址）

**地址**：https://lanyuxi.github.io/kongtouxinxijuhe/

#### 首次启用步骤

1. 打开仓库 **Settings → Pages**
2. **Build and deployment → Source** 选择 **GitHub Actions**
3. 打开 **Actions** 页面，选择 **Deploy to GitHub Pages** → **Run workflow**
4. 等待 workflow 完成，访问上面的地址

推送代码到 `main` 后会自动重新部署，无需手动操作。

#### 为什么需要配置 `BASE_PATH`

GitHub Pages 的**项目站点**运行在子路径下：

```text
https://lanyuxi.github.io/kongtouxinxijuhe/
                          └────── 子路径 ──────┘
```

如果 JS / CSS 用根路径 `/assets/...` 引用，浏览器会去
`https://lanyuxi.github.io/assets/...` 找文件 → **404，白屏**。

因此 workflow 在构建时注入：

```yaml
env:
  BASE_PATH: /${{ github.event.repository.name }}/
```

`vite.config.ts` 读取该变量作为 `base`；未设置时保持 `'./'` 相对路径，
这样 CNB 预览、本地预览与任意静态目录托管都能直接使用。

> 若你使用**用户站点**（仓库名形如 `<用户名>.github.io`）或**自定义域名**，
> 站点位于根路径，此时把 `BASE_PATH` 设为 `/` 或直接删除该 env 即可。

#### 部署到其他静态托管

`dist/` 是纯静态产物，可挂到任意静态托管：

| 平台 | 说明 |
|---|---|
| Cloudflare Pages | 构建命令 `npm run build`，输出目录 `dist`（根路径部署，无需 `BASE_PATH`） |
| Vercel / Netlify | 同上 |
| 对象存储（COS / OSS / S3） | 构建后上传 `dist/`，开启静态网站托管 |
| Nginx / Apache | 直接把 `dist/` 作为站点根目录 |

> 注意：本项目使用 **hash 路由**（`#/detail/xxx`），**不需要**配置 SPA history 回退（rewrite 到 `index.html`）。

### CNB 预览

见 [在线预览 → CNB 云原生开发预览](#cnb-云原生开发预览)。

---

## 配置项

### 数据源开关

数据源适配器集中在 [`scripts/fetch/index.ts`](./scripts/fetch/index.ts)：

```ts
export const adapters: SourceAdapter[] = [
  airdropsIoAdapter,
  defiLlamaAdapter,
  galxeAdapter,
];
```

移除数组中任意一项即可停用该来源，其余逻辑无需改动（健康状态会自动少一行）。

### 官方链接档案

[`data/seed/official-profiles.json`](./data/seed/official-profiles.json) 是**唯一可信的官方链接来源**。

它被用于 `Enrich` 阶段：只有出现在这个文件里的链接才会被标记为官方，
其余第三方页面里提取到的链接仅作交叉参考。这是不变量 4 的实现方式。

### 主题

[`tailwind.config.js`](./tailwind.config.js) 定义浅色主题令牌（`brand` / `ink` / `line` 等）。
项目**不提供深色模式**，这是方案里的明确约束。

---

## 常见问题

<details>
<summary><b>部署后页面白屏 / 资源 404？</b></summary>

大概率是 `BASE_PATH` 没配对。

- 项目站点（`https://<用户>.github.io/<仓库名>/`）→ `BASE_PATH=/<仓库名>/`
- 用户站点 / 自定义域名（根路径）→ `BASE_PATH=/` 或不设置

检查方法：打开部署后的页面 → F12 → Network，
若 `/assets/xxx.js` 返回 404，说明基准路径不对。
</details>

<details>
<summary><b>详情页刷新后 404？</b></summary>

不会。项目使用 **hash 路由**（`https://.../#/project/monad`），
`#` 之后的内容不会发给服务器，因此任何静态托管都能直接工作，无需 rewrite 配置。
</details>

<details>
<summary><b>数据多久更新一次？</b></summary>

- **CNB 侧**：每 3 小时（`17 */3 * * *`）自动抓取，数据变化才提交
- **GitHub Pages 侧**：每次 `main` 有推送时重新构建部署

GitHub Pages 上看到的数据，取决于最近一次同步到 GitHub 的代码。

CNB 侧每 3 小时的定时抓取若产生数据变更，会提交到 CNB `main`；
该提交会触发 **CNB → GitHub 自动同步**流水线，把最新代码与数据一起推到 GitHub，
再由 GitHub Actions 重新构建部署。**两端数据自动保持一致，无需人工干预。**
</details>

<details>
<summary><b>想在 GitHub 上也定时自动更新数据？</b></summary>

在 `.github/workflows/deploy-pages.yml` 的 `on:` 段追加：

```yaml
on:
  schedule:
    - cron: '17 */3 * * *'   # 每 3 小时，避开整点
```

> GitHub Actions 的 cron 使用 UTC 时间。若需要在构建后把数据提交回仓库，
> 需要额外授予 `contents: write` 权限并在 job 内 `git commit && git push`。
</details>

<details>
<summary><b>为什么有的项目显示「数据来源异常」？</b></summary>

某个数据源抓取失败。系统**不会**因此清空数据，而是保留上一次成功的结果（Last Known Good），
并在页面上透明提示。可以查看 `data/source-health.json` 了解每个来源的状态与最后成功时间。
</details>

<details>
<summary><b>Galxe 数据总是抓不到？</b></summary>

Galxe 页面为纯客户端渲染，服务端抓取无法拿到内容。目前该来源会自动降级并标记为失败，
不影响其他来源。后续可以接入官方 API 或直接移除该适配器。
</details>

<details>
<summary><b>我的收藏数据存在哪？</b></summary>

只存在你浏览器的 LocalStorage 里，**不会上传到任何服务器**。
清理浏览器数据会同时清空收藏。第一版不做跨设备同步。
</details>

<details>
<summary><b>评分能保证准确吗？</b></summary>

**不能。** DropLens 只表达「证据置信度」「风险评估」「参与价值」，
不承诺空投的真实性，也不承诺收益。所有分数都附带理由与来源，请自行核对原始链接。
</details>

---

## 明确不做

```text
❌ 数据库 / 后台管理系统 / 用户登录
❌ 独立 Server / VPS / 常驻服务
❌ 钱包托管 / 自动签名 / 自动交易 / 批量撸毛
❌ 全量 X 爬虫 / 浏览器实时调用 AI
❌ 跨设备同步（第一版接受 LocalStorage 的局限）
❌ 收益承诺 / 安全性承诺
```

---

## 安全说明

- **永远不要**在任何页面输入助记词、私钥或 Keystore
- DropLens 的任何页面都**不会**向你索要这些信息
- 建议使用一个**独立的空投钱包**，与主资产钱包隔离
- 本项目不发起任何链上交易，不请求钱包签名
- 构建产物会做 Secret 扫描（见 `scripts/lib/validate.ts` 的 `scanForSecrets`）
- 前端源码目录 `src/` 中的任何文件都不会包含 API Key / Private Key

---

## 贡献

### 提交流程

```bash
git checkout -b feat/your-feature
# 开发…
npm run pipeline && npm test && npm run validate && npm run build
git add -A
git commit -m 'feat: 你的改动'
git push origin HEAD
```

### 约束

- 任何改动**不得违反** [核心不变量](#核心不变量)
- 新增评分维度必须同时提供**可解释的中文理由**
- 新增数据源必须是**独立适配器**，并具备失败隔离能力
- 提交前请确保 `npm test` 与 `npm run validate` 全部通过
- 不要在前端代码中引入任何密钥

---

## 免责声明

本站仅聚合公开信息，并提供证据置信度、风险等级与参与价值参考，
**不构成投资建议**，不保证空投真实性与收益。

空投信息的时效性强、变化快，请以官方渠道发布的信息为准。
请始终使用独立的空投钱包；任何页面都不会要求你输入助记词或私钥。

---

## License

[MIT](./LICENSE)
