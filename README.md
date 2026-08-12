# WZQxt
一个基于 NextJS + Cloudflare 技术
# 五子棋 · 星穹连珠 — Cloudflare 部署指南

## 架构

```
┌──────────────┐     wss://     ┌────────────────┐
│  前端 Pages  │ ───────────────→│  Worker (DO)    │
│  index.html  │                │  /room/:roomId   │
│  js/netplay  │                │  GameRoom 实例   │
└──────────────┘                └────────────────┘
```

- **Pages** 托管静态前端（根目录文件）
- **Worker + Durable Objects** 处理 WebSocket 信令（`/worker` 目录）

---

## 一、前置准备

1. 注册 [Cloudflare](https://dash.cloudflare.com/sign-up)
2. 安装 [Node.js](https://nodejs.org)（含 npm）
3. 安装 Wrangler CLI：
   ```bash
   npm install -g wrangler
   wrangler login
   ```

---

## 二、部署 Worker（信令服务）

```bash
cd 五子棋/worker
wrangler deploy
```

成功后你会得到类似 `gzxh-go.yourname.workers.dev` 的 Worker 域名。

**记住：Worker 会输出类似 `https://gzxh-go.yourname.workers.dev` 的地址，加上 `/room/XXXX` 就是房间路径。**

---

## 三、部署 Pages（前端）

**方式 1：Git 自动部署（推荐）**

1. 将整个项目上传到 GitHub/GitLab
2. 进入 Cloudflare Pages，新建项目 → 连接 Git 仓库
3. 构建设置：
   - 构建命令：留空
   - 输出目录：`.`（或 `/`）

**方式 2：直接上传**

```bash
wrangler pages deploy . --project-name=gzxh-game
```

---

## 四、配置前端连接地址

部署完成后，前端默认连接地址需要在封面页 **联机对战 → 服务器地址** 中输入。

**建议做法**：修改 `js/netplay.js` 中默认服务器地址（或保持 UI 输入方式）：

```javascript
// 在 connect() 中，默认 URL 可以设为你的 Worker 地址
```

当前设计：用户在前端输入 `wss://yourname.workers.dev`，系统自动拼接 `/room/XXXX` 路径。

---

## 五、测试

1. 在浏览器打开 `https://yourname.pages.dev`
2. 点击 **🌐 联机对战**
3. 服务器地址输入你的 Worker 地址（如 `wss://gzxh-go.yourname.workers.dev`）
4. 点击 **🏠 创建房间** → 得到房间号（如 H7KZ）
5. 另一个浏览器/设备打开相同地址，**🚪 加入房间** → 输入 H7KZ

---

## 六、CORS 处理（可选）

如果跨域访问遇到问题，在 Worker 中添加 CORS 头即可。

---

## 文件清单

| 路径 | 用途 |
|------|------|
| `index.html` | 前端页面 |
| `styles.css` | 样式表 |
| `js/` | 前端逻辑（含 netplay.js） |
| `worker/index.js` | Cloudflare DO 信令服务 |
| `worker/wrangler.toml` | Worker 部署配置 |
| `server.js` | 本地 Node.js 服务器（也可用，不上传） |
