#!/usr/bin/env node
/**
 * 麦麦军团 · 命令行模式
 *
 *   node src/cli.mjs                 交互菜单
 *   node src/cli.mjs demo            非交互演示完整流程（独立存档）
 *   node src/cli.mjs state           查看当前状态
 *   node src/cli.mjs checkin         签到
 *   node src/cli.mjs stores          查看打卡候选门店
 *   node src/cli.mjs clockin <code>  打卡
 *   node src/cli.mjs orders          领取今日订单奖励
 *   node src/cli.mjs encounter       偶遇小动物
 *   node src/cli.mjs attack <key>    攻略据点
 *   node src/cli.mjs build <key> [将军名]  派遣建设
 *   node src/cli.mjs codex           图鉴
 *   node src/cli.mjs reset           重置存档
 */
import { createInterface } from "node:readline";
import { existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { McdApi } from "./mcp/mcdApi.js";
import { LocalSqliteStore } from "./store/LocalSqliteStore.js";
import { LegionEngine } from "./game/engine.js";
import { STRONGHOLDS, UNITS, ANIMALS } from "./game/config.js";
import { BUILD } from "./game/story.js";
import { readFileSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DEMO = process.argv.includes("demo");
const DB_PATH = DEMO
  ? join(ROOT, "data", "cli-demo.db")
  : join(ROOT, "data", "mcm-legion.db");
if (!existsSync(join(ROOT, "data"))) mkdirSync(join(ROOT, "data"), { recursive: true });

// 载入 .env
const envPath = join(ROOT, ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const store = new LocalSqliteStore(DB_PATH);
const mcp = new McdApi();
await mcp.connect();
const engine = new LegionEngine(store, mcp);

const C = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m", blue: "\x1b[34m", magenta: "\x1b[35m", cyan: "\x1b[36m",
};

function unitName(key) {
  return UNITS[key]?.name ?? ANIMALS[key]?.name ?? key;
}

function printState() {
  const s = engine.getState();
  console.log(`\n${C.bold}=== 麦麦军团 · ${s.date} ===${C.reset}`);
  console.log(`数据模式：${s.mcp.mode === "online" ? "麦当劳 MCP 真实数据" : "演示模式"}`);
  console.log(`军团总战力：${C.yellow}${s.army.total}${C.reset}（可损失 ${s.army.vulnerable}，将军/动物免疫）`);
  const groups = { fan: [], jun: [], general: [], warrior: [], animal: [] };
  for (const d of s.army.detail) groups[d.type].push(d);
  for (const [type, list] of Object.entries(groups)) {
    if (list.length === 0) continue;
    const label = { fan: "麦麦粉", jun: "麦麦军", general: "麦麦将军", warrior: "美食战士", animal: "偶遇动物(仅今天)" }[type];
    console.log(`  ${label}：${list.map((d) => `${d.name || unitName(d.key)} x${d.count}(${d.power})`).join("，")}`);
  }
  console.log(`今日行动：签到${s.daily.checkin ? "✓" : "○"} 偶遇${s.daily.encounter ? "✓" : "○"} 订单${s.daily.order.claimed ? "✓" : "○"} 派遣${s.daily.dispatch ? "✓" : "○"}`);
  console.log(`帝国进度：已攻略 ${s.empire.conquered}/9，已建成 ${s.empire.built}/9${s.empire.done ? "  🎉 麦麦帝国建成！" : ""}`);
  console.log("\n攻略据点：");
  for (const sh of s.strongholds) {
    const mark = sh.conquered ? "✔ 已攻略" : sh.built ? "🏰 已建成" : sh.damage > 0 ? `💥 ${sh.damageName}` : sh.frontier ? "⚔️ 可攻略" : "🔒 未解锁";
    console.log(`  [${sh.key}] ${sh.name} 战力${sh.power} → ${mark}`);
  }
}

function printBattle(r) {
  console.log(`\n${C.bold}⚔️ 攻略「${r.name}」${C.reset} 出战战力 ${r.startPower}`);
  for (const st of r.stages) {
    const lost = st.lost.map((l) => `${l.name || unitName(l.key)}x${l.count}`).join("、") || "无";
    console.log(`  第${st.stage}阶段：损失 ${C.red}${st.lostPower}${C.reset}（${lost}）→ 剩余 ${C.cyan}${st.remainingPower}${C.reset}`);
  }
  if (r.conquered) console.log(`  ${C.green}🎉 完全损毁！「${r.name}」攻略成功，解锁下一个据点与建设任务${C.reset}`);
  else console.log(`  ${C.yellow}战力不足，被迫撤退。损毁进度已保留（${r.damage}/5），改日再战${C.reset}`);
}

async function demo() {
  console.log("=== 演示模式：完整流程 ===\n");
  printState();
  console.log("\n--- 签到 ---");
  console.log(engine.checkin());
  console.log("\n--- 打卡候选门店 ---");
  const { mode, stores } = await engine.clockinStores();
  console.log(`模式：${mode}`);
  for (const s of stores.slice(0, 4)) console.log(`  ${s.storeCode}  ${s.storeName}  ${s.address}`);
  console.log("\n--- 打卡第一家 ---");
  console.log(await engine.clockin(stores[0].storeCode));
  console.log("\n--- 今日订单奖励 ---");
  const orders = await engine.claimOrders();
  console.log(`今日 ${orders.orderCount} 单，获得：`, orders.gained.map((g) => unitName(g.warriorKey)));
  console.log("\n--- 偶遇 ---");
  const enc = engine.encounter();
  console.log(`偶遇：${unitName(enc.gained.key)}`);
  printState();
  console.log("\n--- 攻略第一个据点 ---");
  printBattle(engine.attack("cheap"));
  console.log("\n--- 开启建设（派遣将军出任店长） ---");
  const firstStore = store.listStores()[0];
  const build = engine.dispatchBuild("cheap", firstStore.store_name);
  console.log(`店长：${build.managerName}，消耗：${build.consumed.type === "general" ? "麦麦将军 x1" : "麦麦军 x1"}，当前阶段：${BUILD[build.buildStep].name}`);
  console.log("\n=== 演示结束（存档：data/cli-demo.db）===");
}

const cmd = DEMO ? "demo" : process.argv[2];
const arg = process.argv[3];

switch (cmd) {
  case "demo":
    await demo();
    break;
  case "state":
    printState();
    break;
  case "checkin":
    console.log(engine.checkin());
    break;
  case "stores": {
    const { mode, stores } = await engine.clockinStores();
    console.log(`模式：${mode}`);
    stores.forEach((s, i) => console.log(`${i + 1}. [${s.storeCode}] ${s.storeName} — ${s.address}`));
    break;
  }
  case "clockin":
    console.log(await engine.clockin(arg));
    break;
  case "orders":
    console.log(await engine.claimOrders());
    break;
  case "encounter":
    console.log(engine.encounter());
    break;
  case "attack":
    printBattle(engine.attack(arg));
    break;
  case "build":
    console.log(engine.dispatchBuild(arg, process.argv[4] ?? ""));
    break;
  case "codex": {
    const c = engine.codex();
    console.log("动物图鉴：");
    c.animals.forEach((a) => console.log(`  ${a.discovered ? "✔" : "○"} ${a.name}（战力${a.power}）${a.discovered ? ` 首遇 ${a.firstSeen}，共 ${a.seenCount} 次` : ""}`));
    console.log("打卡地：");
    c.stores.forEach((s) => console.log(`  ${s.storeName} — 打卡 ${s.clockinCount} 次${s.isManager ? "（店长）" : ""}`));
    console.log("据点图鉴：");
    c.ruins.forEach((r) => console.log(`  ${r.name} — ${r.conquered ? "已攻略" : `损毁 ${r.damage}/5`}`));
    break;
  }
  case "battles":
    engine.battles().forEach((b) => console.log(`[${b.date}] ${b.strongholdName}: ${b.detail.conquered ? "攻略成功" : "撤退"}，战力 ${b.detail.startPower}→${b.detail.endPower}`));
    break;
  case "reset":
    engine.reset();
    console.log("存档已重置");
    break;
  default:
    await interactive();
}

async function interactive() {
  printState();
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise((r) => rl.question(q, r));
  for (;;) {
    console.log(`\n${C.cyan}1${C.reset} 签到  ${C.cyan}2${C.reset} 打卡  ${C.cyan}3${C.reset} 订单奖励  ${C.cyan}4${C.reset} 偶遇  ${C.cyan}5${C.reset} 攻略  ${C.cyan}6${C.reset} 建设派遣  ${C.cyan}7${C.reset} 图鉴  ${C.cyan}0${C.reset} 退出`);
    const choice = (await ask("选择> ")).trim();
    try {
      if (choice === "0") break;
      if (choice === "1") console.log(engine.checkin());
      if (choice === "2") {
        const { stores } = await engine.clockinStores();
        stores.forEach((s, i) => console.log(`${i + 1}. [${s.storeCode}] ${s.storeName}`));
        const idx = Number(await ask("打卡序号> ")) - 1;
        console.log(await engine.clockin(stores[idx].storeCode));
      }
      if (choice === "3") {
        const r = await engine.claimOrders();
        console.log(`今日 ${r.orderCount} 单，获得`, r.gained.map((g) => unitName(g.warriorKey)));
      }
      if (choice === "4") console.log(engine.encounter());
      if (choice === "5") {
        const key = (await ask("据点 key> ")).trim();
        printBattle(engine.attack(key));
      }
      if (choice === "6") {
        const key = (await ask("据点 key> ")).trim();
        const row = store.getStronghold(key);
        let general = "";
        if (row.build_step < 0) general = (await ask("出任店长的将军名> ")).trim();
        console.log(engine.dispatchBuild(key, general));
      }
      if (choice === "7") {
        const c = engine.codex();
        console.log("动物：", c.animals.filter((a) => a.discovered).map((a) => a.name).join("、") || "（尚未偶遇）");
      }
    } catch (e) {
      console.log(`${C.red}${e.message}${C.reset}`);
    }
    printState();
  }
  rl.close();
}

await mcp.close();
store.close();
