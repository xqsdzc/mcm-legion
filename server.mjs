#!/usr/bin/env node
/**
 * 麦麦军团 · Web 服务器
 *
 *   node server.mjs           启动游戏 → http://localhost:3210
 *   PORT=8080 node server.mjs 指定端口
 *   MCD_DB=data/test.db node server.mjs  使用独立存档（测试用）
 *
 * 零外部依赖即可启动（离线演示模式）；
 * 配置 MCD_MCP_TOKEN 后自动切换为麦当劳 MCP 真实数据模式。
 */
import { createServer } from "node:http";
import { readFileSync, mkdirSync, existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { McdApi } from "./src/mcp/mcdApi.js";
import { LocalSqliteStore } from "./src/store/LocalSqliteStore.js";
import { LegionEngine } from "./src/game/engine.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const PUBLIC = join(ROOT, "public");
const ASSETS = join(ROOT, "assets");
const DATA_DIR = join(ROOT, "data");
// MCD_DB 可指向其他存档文件（测试/演示用）；默认 data/mcm-legion.db
const DB_PATH = process.env.MCD_DB ? join(ROOT, process.env.MCD_DB) : join(DATA_DIR, "mcm-legion.db");
const PORT = Number(process.env.PORT || 3210);

/* ---- 极简 .env 解析（不引入 dotenv 依赖） ---- */
function loadEnv() {
  const envPath = join(ROOT, ".env");
  if (!existsSync(envPath)) return;
  const text = readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadEnv();

/* ---- 装配 ---- */
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
const store = new LocalSqliteStore(DB_PATH);
const mcp = new McdApi();
const engine = new LegionEngine(store, mcp);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
};

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return {};
  }
}

/** 静态文件：public/ 与 assets/ */
async function serveStatic(urlPath, res) {
  let filePath;
  if (urlPath.startsWith("/assets/")) {
    filePath = join(ASSETS, normalize(urlPath.slice("/assets/".length)));
  } else {
    const clean = normalize(urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, ""));
    filePath = join(PUBLIC, clean);
  }
  if (!filePath.startsWith(PUBLIC) && !filePath.startsWith(ASSETS)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  if (!existsSync(filePath)) {
    // SPA 回退
    const fallback = join(PUBLIC, "index.html");
    if (existsSync(fallback)) return serveFile(fallback, res);
    res.writeHead(404);
    return res.end("Not Found");
  }
  const s = await stat(filePath);
  if (s.isDirectory()) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  return serveFile(filePath, res);
}

async function serveFile(filePath, res) {
  const ext = extname(filePath).toLowerCase();
  const data = await readFile(filePath);
  res.writeHead(200, {
    "Content-Type": MIME[ext] ?? "application/octet-stream",
    "Cache-Control": "no-cache",
  });
  res.end(data);
}

/* ---- 路由 ---- */
const routes = {
  "GET /api/state": async () => engine.getState(),
  "GET /api/codex": async () => engine.codex(),
  "GET /api/battles": async () => engine.battles(),
  "GET /api/stores": async (url) => engine.clockinStores(url.searchParams.get("city") || undefined),
  "POST /api/checkin": async () => engine.checkin(),
  "POST /api/clockin": async (_q, body) => engine.clockin(body.storeCode, body.city, body.store),
  "POST /api/orders": async () => engine.claimOrders(),
  "POST /api/encounter": async () => engine.encounter(),
  "POST /api/attack": async (_q, body) => engine.attack(body.key),
  "POST /api/build": async (_q, body) => engine.dispatchBuild(body.key, body.generalName ?? ""),
  "POST /api/locate": async () => locateCity(),
  "POST /api/reset": async () => {
    engine.reset();
    return { ok: true };
  },
};

/**
 * IP 定位：解析用户当前所在城市（供打卡门店搜索使用）。
 * 麦当劳 MCP 的 query-nearby-stores 只支持「城市 + 关键词」，
 * 拿不到经纬度，所以用 IP 定位反推城市，再由用户确认/切换。
 * 返回形如：{ city: "苏州", raw: "中国 江苏 苏州 移动" }
 */
async function locateCity() {
  const res = await fetch("https://myip.ipip.net", { signal: AbortSignal.timeout(6000) });
  const text = await res.text();
  // 形如：当前 IP：2409:...  来自于：中国 江苏 苏州  移动
  const m = text.match(/来自于：(.+)/);
  const parts = (m?.[1] ?? "").trim().split(/\s+/);
  // [国家, 省/直辖市, 城市, 运营商…]；直辖市形如「中国 北京 北京」
  let city = parts[2] ?? "";
  if (!city && parts[1]) city = parts[1]; // 兜底：只有省级信息时用省名
  city = city.replace(/市$/, "");
  return { city, raw: (m?.[1] ?? "").trim() };
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);
  const path = url.pathname;
  try {
    if (path.startsWith("/api/")) {
      const key = `${req.method} ${path}`;
      const handler = routes[key];
      if (!handler) return sendJson(res, 404, { error: "接口不存在" });
      const body = await readBody(req);
      const result = await handler(url, body);
      return sendJson(res, 200, result ?? { ok: true });
    }
    if (req.method !== "GET") {
      res.writeHead(405);
      return res.end("Method Not Allowed");
    }
    return await serveStatic(path, res);
  } catch (err) {
    return sendJson(res, 400, { error: err.message ?? String(err) });
  }
});

/* ---- 启动 ---- */
await mcp.connect();
server.listen(PORT, () => {
  const status = mcp.status();
  console.log("");
  console.log("  🍔 麦麦军团 MCM Legion 已启动");
  console.log(`  → 游戏地址: http://localhost:${PORT}`);
  console.log(
    `  → 数据模式: ${status.mode === "online" ? "麦当劳 MCP 真实数据" : "演示模式（配置 MCD_MCP_TOKEN 后启用真实数据）"}`
  );
  if (status.lastError) console.log(`  → ${status.lastError}`);
  console.log(`  → 本地数据库: ${DB_PATH}`);
  console.log("");
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    mcp.close().finally(() => {
      store.close();
      server.close(() => process.exit(0));
    });
  });
}
