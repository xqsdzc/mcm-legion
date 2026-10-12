/**
 * 麦当劳 MCP 接入层
 *
 * 通过官方 MCP Server（https://mcp.mcd.cn）获取两类真实数据：
 *   1. query-nearby-stores  附近/收藏门店  → 「打卡」收集麦麦将军
 *   2. order-list           历史订单       → 「今日订单奖励」收集美食战士
 *
 * 设计要点：
 *   - Token 从环境变量 MCD_MCP_TOKEN 读取，绝不入库、绝不写入代码
 *   - 未配置 Token 或连接失败时自动进入「演示模式」：使用内置示例数据，
 *     游戏全流程可玩，便于无 Token 环境下体验与自动化测试
 *   - @modelcontextprotocol/sdk 采用动态 import：未 npm install 时不影响启动
 */

import { MOCK } from "../game/config.js";

const ENDPOINT = "https://mcp.mcd.cn";

/** 今天的本地日期 YYYY-MM-DD */
export function todayStr(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * 本地时间字符串 YYYY-MM-DD HH:mm:ss。
 * 注意：不可用 toISOString()——那是 UTC，与本地日期比较会差一天，
 * 会导致「跨日判定」误触发（动物被立即清空）。
 */
export function nowLocalStr(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${todayStr(d)} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** 从 MCP 文本返回中提取 JSON */
/**
 * 从 MCP 工具返回的文本中提取 JSON。
 *
 * 麦当劳 MCP 的返回是「Markdown 前言 + JSON 正文」，前言里会出现 `data[]`
 * 这类字样，直接找第一个 `[`/`{` 会切错位置。这里用括号配对扫描：
 * 优先尝试以 `{` 开头的候选（业务响应都是对象），失败再试 `[`。
 */
function parseJsonText(text) {
  if (typeof text !== "string") return null;
  const tryFrom = (open) => {
    const n = text.length;
    for (let i = 0; i < n; i++) {
      if (text[i] !== open) continue;
      let depth = 0;
      let inStr = false;
      let esc = false;
      for (let j = i; j < n; j++) {
        const c = text[j];
        if (inStr) {
          if (esc) esc = false;
          else if (c === "\\") esc = true;
          else if (c === '"') inStr = false;
          continue;
        }
        if (c === '"') inStr = true;
        else if (c === "{" || c === "[") depth++;
        else if (c === "}" || c === "]") {
          depth--;
          if (depth === 0) {
            try {
              return JSON.parse(text.slice(i, j + 1));
            } catch {
              break; // 这一处不是完整 JSON，继续找下一个起点
            }
          }
        }
      }
    }
    return null;
  };
  return tryFrom("{") ?? tryFrom("[");
}

/**
 * 合并收藏与城市搜索两路门店，按 storeCode 去重。
 * 收藏门店优先（两路都出现时保留收藏来源，且排在前面）；
 * 城市搜索中重复出现的门店也会去重。
 * @param {Array<{storeCode:string, storeName:string, address:string}>} fav
 * @param {Array<{storeCode:string, storeName:string, address:string}>} city
 * @returns {Array<{storeCode:string, storeName:string, address:string}>}
 */
function mergeStores(fav = [], city = []) {
  const seen = new Set();
  const out = [];
  const pushUnique = (s) => {
    if (seen.has(s.storeCode)) return;
    seen.add(s.storeCode);
    out.push(s);
  };
  fav.forEach(pushUnique);
  city.forEach(pushUnique);
  return out;
}

export class McdApi {
  /**
   * @param {{token?: string, city?: string, keyword?: string}} opts
   */
  constructor(opts = {}) {
    this.token = opts.token || process.env.MCD_MCP_TOKEN || "";
    this.city = opts.city || process.env.MCD_CITY || "上海";
    this.keyword = opts.keyword || process.env.MCD_KEYWORD || "麦当劳";
    this.mode = "offline"; // offline | online
    this.client = null;
    this.lastError = "";
    this._sdk = null;
  }

  /** 连接 MCP Server；失败则保持演示模式 */
  async connect() {
    if (!this.token) {
      this.mode = "offline";
      this.lastError = "未配置 MCD_MCP_TOKEN";
      return this;
    }
    try {
      const [{ Client }, { StreamableHTTPClientTransport }] = await Promise.all([
        import("@modelcontextprotocol/sdk/client/index.js"),
        import("@modelcontextprotocol/sdk/client/streamableHttp.js"),
      ]);
      this._sdk = { Client, StreamableHTTPClientTransport };
      const client = new Client({ name: "mcm-legion", version: "1.0.0" });
      await client.connect(
        new StreamableHTTPClientTransport(new URL(ENDPOINT), {
          requestInit: { headers: { Authorization: `Bearer ${this.token}` } },
        })
      );
      this.client = client;
      this.mode = "online";
      this.lastError = "";
    } catch (err) {
      this.mode = "offline";
      this.lastError = `MCP 连接失败：${err.message}`;
    }
    return this;
  }

  async close() {
    try {
      await this.client?.close();
    } catch {
      /* 忽略 */
    }
  }

  async listTools() {
    if (this.mode !== "online") return [];
    const { tools } = await this.client.listTools();
    return tools;
  }

  /** 底层调用，返回原始文本 */
  async callRaw(name, args = {}) {
    const res = await this.client.callTool({ name, arguments: args });
    if (res.isError) {
      throw new Error(`工具 ${name} 返回错误：${JSON.stringify(res.content).slice(0, 200)}`);
    }
    const parts = Array.isArray(res.content) ? res.content : [res];
    return parts.map((c) => (c.type === "text" ? c.text : JSON.stringify(c))).join("\n");
  }

  /**
   * 打卡候选门店列表。
   * 合并两路真实数据以增加打卡多样性：
   *   - 收藏餐厅（searchType=1，标记 isFavorite=true）
   *   - 城市关键词搜索（searchType=2，标记 isFavorite=false）
   * 两路都查，按 storeCode 合并去重（同一门店在两路都出现时保留收藏来源），
   * 收藏门店排在前面。只有当两路都为空时才抛错。
   * @param {{city?: string}} [opts] city 可覆盖默认城市（MCP 的 searchType=2 必须指定城市）
   * @returns {Promise<{mode: string, stores: Array<{storeCode, storeName, address, isFavorite}>}>}
   */
  async getStores({ city } = {}) {
    if (this.mode !== "online") {
      return {
        mode: "offline",
        // 演示模式：第一家视作「收藏」，其余视作城市搜索，便于展示来源标识
        stores: MOCK.stores.map((s, i) => ({ ...s, isFavorite: i === 0 })),
      };
    }
    // 顺序执行两路查询，避免 MCP 流式传输并发冲突
    const fav = (await this._queryStores({ beType: 1, searchType: 1 })).map((s) => ({
      ...s,
      isFavorite: true,
    }));
    const cityStores = (await this._queryStores({
      beType: 1,
      searchType: 2,
      city: city || this.city,
      keyword: this.keyword,
    })).map((s) => ({ ...s, isFavorite: false }));
    const stores = mergeStores(fav, cityStores);
    if (stores.length === 0) throw new Error("未查询到附近门店");
    return { mode: "online", stores };
  }

  async _queryStores(args) {
    const text = await this.callRaw("query-nearby-stores", args);
    const resp = parseJsonText(text);
    const data = resp?.data;
    const list = Array.isArray(data) ? data : Array.isArray(data?.list) ? data.list : [];
    return list
      .filter((s) => s && s.storeCode && s.storeName)
      .map((s) => ({
        storeCode: String(s.storeCode),
        storeName: String(s.storeName),
        address: String(s.address ?? ""),
      }));
  }

  /**
   * 今日订单列表（order-list，非商城订单）。
   * @returns {Promise<{mode: string, orders: Array<{orderId, storeName, createTime, amount, products: string[]}>}>}
   */
  async getTodayOrders(today = todayStr()) {
    if (this.mode !== "online") {
      const count = MOCK.orderCountByDate(today);
      const orders = Array.from({ length: count }, (_, i) => ({
        orderId: `DEMO-${today}-${i + 1}`,
        storeName: MOCK.stores[i % MOCK.stores.length].storeName,
        createTime: `${today} 12:00:00`,
        amount: "0",
        products: [],
      }));
      return { mode: "offline", orders };
    }
    const text = await this.callRaw("order-list", {});
    const resp = parseJsonText(text);
    const list = resp?.data?.list;
    const all = Array.isArray(list) ? list : [];
    const orders = all
      .filter((o) => isSameDay(o?.createTime, today))
      .map((o) => ({
        orderId: String(o.orderId ?? ""),
        storeName: String(o.storeName ?? ""),
        createTime: String(o.createTime ?? ""),
        amount: String(o.realTotalAmount ?? ""),
        products: (o.orderProductList ?? []).map(
          (p) => `${p.productName ?? ""}x${p.quantity ?? 1}`
        ),
      }));
    return { mode: "online", orders };
  }

  /** 当前模式（供前端展示「演示模式」徽标） */
  status() {
    return {
      mode: this.mode,
      endpoint: ENDPOINT,
      hasToken: Boolean(this.token),
      lastError: this.lastError,
    };
  }
}

/** createTime 兼容 "2026-10-12 02:12:06" / "2026/10/12" 等格式 */
function isSameDay(createTime, today) {
  if (!createTime || !today) return false;
  const norm = String(createTime).replace(/\//g, "-").slice(0, 10);
  return norm === today;
}
