#!/usr/bin/env node
/**
 * 麦麦军团 · 游戏逻辑自检
 *
 *   node scripts/checkgame.mjs
 *
 * 覆盖：每日限制、打卡规则（将军唯一/可再次获得）、订单奖励、
 *       偶遇确定性、五阶段攻略与撤退、建设消耗与店长、跨日动物离队、
 *       全据点通关曲线（加速模拟）。
 */
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { LocalSqliteStore } from "../src/store/LocalSqliteStore.js";
import { McdApi } from "../src/mcp/mcdApi.js";
import { LegionEngine } from "../src/game/engine.js";
import { STRONGHOLDS, WARRIOR_KEYS, ANIMAL_KEYS } from "../src/game/config.js";
import { nowLocalStr } from "../src/mcp/mcdApi.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DB = join(ROOT, "data", "_checkgame.db");

let passed = 0;
let failed = 0;
function ok(cond, name, extra = "") {
  if (cond) {
    passed++;
    console.log(`  ✔ ${name}`);
  } else {
    failed++;
    console.log(`  ✘ ${name} ${extra}`);
  }
}

function freshEngine() {
  if (existsSync(DB)) rmSync(DB);
  const store = new LocalSqliteStore(DB);
  const mcp = new McdApi(); // 无 token → 演示模式
  const engine = new LegionEngine(store, mcp);
  return { store, engine };
}

/** 模拟进入新的一天：清空每日记录并把 updated_at 拨到昨天 */
function nextDay(store) {
  store.db.exec("DELETE FROM daily_log; DELETE FROM clockin_log;");
  const yesterday = nowLocalStr(new Date(Date.now() - 86400000));
  store.db.prepare("UPDATE player SET updated_at = ? WHERE id = 1").run(yesterday);
}

/** 直接发放单位（测试加速用） */
function grant(store, type, key, count, name = "") {
  store.addUnit(type, key, name, count);
}

console.log("\n[1] 每日行动限制");
{
  const { store, engine } = freshEngine();
  const c1 = engine.checkin();
  ok(c1.firstEver === true, "首次签到标记（用于弹世界观）");
  let err = null;
  try {
    engine.checkin();
  } catch (e) {
    err = e;
  }
  ok(err !== null, "签到一天一次");
  const fans = store.getUnitCount("fan", "fan", "男") + store.getUnitCount("fan", "fan", "女");
  ok(fans === 1, "签到获得 1 麦麦粉（随机男女）");
  ok(store.getUnitCount("fan", "fan", "男") <= 1 && store.getUnitCount("fan", "fan", "女") <= 1, "麦麦粉按性别分单位存放");

  engine.encounter();
  const seen1 = store.getDaily(engine.getState().date, "encounter").detail;
  err = null;
  try {
    engine.encounter();
  } catch (e) {
    err = e;
  }
  ok(err !== null, "偶遇一天一次");
  ok(ANIMAL_KEYS.includes(seen1), "偶遇获得动物");

  // 同一天再次 encounter 报错；新的一天再 encounter：旧动物离队。
  // 偶遇为真随机（避免同一天反复体验总是同一只）：跨天后可能重逢，也可能是新动物
  nextDay(store);
  const before = store.getUnitCount("animal", seen1);
  engine.encounter();
  const after = store.getDaily(engine.getState().date, "encounter").detail;
  ok(before === 1 && ANIMAL_KEYS.includes(after), "偶遇每日重置（旧动物离队，当天可再偶遇）");
  ok(store.getUnitCount("animal", seen1) === (after === seen1 ? 1 : 0), "动物不叠加，跨天后重新偶遇");
  store.close();
}

console.log("\n[2] 打卡规则");
{
  const { store, engine } = freshEngine();
  const { stores } = await engine.clockinStores();
  const target = stores[0];
  const r1 = await engine.clockin(target.storeCode);
  ok(r1.gotGeneral === true, "首次打卡获得该店将军");
  ok(store.getUnitCount("general", "general", target.storeName) === 1, "将军以门店命名");
  ok(store.getUnitCount("jun", "jun") === 3, "打卡获得 3 麦麦军");

  let err = null;
  try {
    await engine.clockin(target.storeCode);
  } catch (e) {
    err = e;
  }
  ok(err !== null, "同一门店一天只能打卡一次");

  const r2 = await engine.clockin(stores[1].storeCode);
  ok(r2.gotGeneral === true, "换一家店打卡获得新将军");

  nextDay(store);
  const r3 = await engine.clockin(target.storeCode);
  ok(r3.gotGeneral === false, "已拥有该店将军后，再打卡只得麦麦军");
  ok(store.getUnitCount("jun", "jun") === 3 + 3 + 3, "三次打卡共 9 麦麦军");
  store.close();
}

console.log("\n[3] 订单奖励（演示模式）");
{
  const { store, engine } = freshEngine();
  const r = await engine.claimOrders();
  ok(r.orderCount >= 1, `今日 ${r.orderCount} 单订单`);
  ok(r.gained.length === r.orderCount, "每单获得 1 名美食战士");
  const r2 = await engine.claimOrders();
  ok(r2.gained.length === 0, "同一订单不重复发奖");
  ok(WARRIOR_KEYS.includes(r.gained[0]?.warriorKey), "奖励为美食战士");
  store.close();
}

console.log("\n[4] 攻略：五阶段、撤退与续攻");
{
  const { store, engine } = freshEngine();
  // 4 麦麦军（140）对 60 战力据点：约 3 阶段后剩余战力低于据点，被迫撤退
  grant(store, "jun", "jun", 4); // 140
  const res = engine.attack(STRONGHOLDS[0].key);
  ok(res.stages.length === 3, `约 2.3 倍战力时完成 3 阶段（实际 ${res.stages.length}）`);
  ok(res.stages.every((s) => s.name && s.desc), "每阶段带损毁名称与描述（写入战斗日志）");
  ok(res.stages[0].name === "轻微损伤" && res.stages[0].desc === "招牌晃了晃，橱玻璃裂了一道缝。", "阶段描述取自损毁六阶段文案");
  ok(res.conquered === false, "未完全损毁");
  ok(res.endPower < STRONGHOLDS[0].power, `撤退时剩余 ${res.endPower} 已低于据点战力`);
  ok(store.getStronghold(STRONGHOLDS[0].key).damage === 3, "损毁进度保留为 3 阶段");

  // 战力不足时无法开始攻略
  let err = null;
  try {
    engine.attack(STRONGHOLDS[0].key);
  } catch (e) {
    err = e;
  }
  ok(err !== null, "战力不高于据点时无法开始攻略");

  // 第二天补充后再打：从第 4 阶段继续，无需从第一阶段重打
  nextDay(store);
  grant(store, "warrior", "warrior_fries", 20); // 3200
  const res2 = engine.attack(STRONGHOLDS[0].key);
  ok(res2.stages.length === 2, `续攻只需完成剩余 2 阶段（实际 ${res2.stages.length}）`);
  ok(res2.conquered === true, "补充战力后攻略成功");
  ok(store.getStronghold(STRONGHOLDS[0].key).damage === 5, "损毁阶段记为 5（完全损毁）");

  // 攻略后解锁下一个
  ok(engine.frontier() === STRONGHOLDS[1].key, "解锁下一个据点");
  // 未解锁的据点不能打
  err = null;
  try {
    engine.attack(STRONGHOLDS[3].key);
  } catch (e) {
    err = e;
  }
  ok(err !== null, "未解锁据点不可攻略");
  store.close();
}

console.log("\n[5] 建设：消耗将军/麦麦军、店长、可再次获得");
{
  const { store, engine } = freshEngine();
  const { stores } = await engine.clockinStores();
  const target = stores[0];
  await engine.clockin(target.storeCode);
  grant(store, "warrior", "warrior_bigmac", 40); // 10400，足以通关前 3 个据点
  engine.attack(STRONGHOLDS[0].key);

  const b1 = engine.dispatchBuild(STRONGHOLDS[0].key, target.storeName);
  ok(b1.consumed.type === "general", "开启建设消耗 1 名麦麦将军");
  ok(b1.managerName === target.storeName, "将军名字显示为店长");
  ok(b1.buildStep === 0, "建设进度 mm_0（夯土奠基）");
  ok(b1.buildDesc === "店长亲手浇下第一方混凝土。", "建设描述写入展示（六阶段文案）");
  ok(store.getUnitCount("general", "general", target.storeName) === 0, "将军被消耗");
  ok(store.getStore(target.storeCode).has_general === 0, "该店将军标记解除");

  // 同一天不能第二次派遣
  let err = null;
  try {
    engine.dispatchBuild(STRONGHOLDS[0].key, "");
  } catch (e) {
    err = e;
  }
  ok(err !== null, "每日只能派遣一次");

  nextDay(store);
  const r = await engine.clockin(target.storeCode);
  ok(r.gotGeneral === true, "将军被消耗后，再次打卡可重新获得");

  nextDay(store);
  const b2 = engine.dispatchBuild(STRONGHOLDS[0].key, "");
  ok(b2.consumed.type === "jun", "后续派遣消耗 1 名麦麦军");
  ok(b2.buildStep === 1, "建设进度推进到 mm_1");

  // 未攻略的据点不能建设
  err = null;
  try {
    engine.dispatchBuild(STRONGHOLDS[1].key, "");
  } catch (e) {
    err = e;
  }
  ok(err !== null, "未攻略据点无法建设");

  // 麦麦军不足时报错
  store.clearByType("jun");
  nextDay(store);
  err = null;
  try {
    engine.dispatchBuild(STRONGHOLDS[0].key, "");
  } catch (e) {
    err = e;
  }
  ok(err !== null, "麦麦军不足无法派遣");
  store.close();
}

console.log("\n[6] 跨日动物离队");
{
  const { store, engine } = freshEngine();
  engine.encounter();
  ok(store.listUnits().some((u) => u.type === "animal"), "当天拥有动物");
  nextDay(store);
  engine.getState(); // 触发 rollover
  ok(!store.listUnits().some((u) => u.type === "animal"), "跨天后动物离队");
  const codex = engine.codex();
  ok(codex.animals.some((a) => a.discovered), "动物仍记录在图鉴中");
  store.close();
}

console.log("\n[7] 全据点通关曲线（自然收入模拟）");
{
  const { store, engine } = freshEngine();
  let day = 0;
  const { stores } = await engine.clockinStores();
  for (const sh of STRONGHOLDS) {
    let guard = 0;
    while (!store.getStronghold(sh.key).conquered) {
      if (++guard > 60) break;
      nextDay(store);
      day++;
      engine.checkin();
      engine.encounter();
      await engine.claimOrders();
      await engine.clockin(stores[(day - 1) % stores.length].storeCode);
      const army = engine.army();
      if (army.total > sh.power) engine.attack(sh.key);
    }
    const row = store.getStronghold(sh.key);
    ok(row.conquered, `${sh.name}（战力 ${sh.power}）已攻略 — 第 ${day} 天，累计 ${guard} 次出征`);
  }
  const conquered = STRONGHOLDS.filter((s) => store.getStronghold(s.key).conquered).length;
  console.log(`  → 自然收入下 ${day} 天攻略 ${conquered}/9 个据点`);
  ok(conquered === 9, "自然收入可通关全部据点");
  ok(day <= 60, `总时长 ${day} 天在预期范围内`);
  store.close();
}

console.log("\n[8] 成就系统");
{
  const { store, engine } = freshEngine();
  const view0 = engine.getState().achievements;
  ok(view0.total === 20, "共 20 枚成就");
  ok(view0.unlocked === 0, "初始无解锁");
  ok(view0.items.every((a) => a.badge.startsWith("<svg")), "每枚成就都带徽章 SVG");

  const c = engine.checkin();
  ok(c.achievements.some((a) => a.key === "first_fan"), "首次签到解锁「初入麦门」");
  ok(store.hasAchievement("first_fan"), "成就已持久化");
  ok(engine.checkAchievements().length === 0, "成就判定幂等（不重复解锁）");

  await engine.claimOrders();
  ok(store.hasAchievement("first_order"), "首次领订单奖励解锁「第一桶金」");

  const { stores } = await engine.clockinStores();
  for (let i = 0; i < 5; i++) await engine.clockin(stores[i].storeCode);
  ok(store.hasAchievement("first_clockin"), "首次打卡解锁「第一站」");
  ok(store.hasAchievement("stores_5"), "5 家门店解锁「巡城麦客」");
  ok(store.hasAchievement("generals_5"), "同时 5 名将军解锁「五虎聚义」");

  engine.encounter();
  ok(store.hasAchievement("first_encounter"), "首次偶遇解锁「命中注定」");

  // 集齐 8 种美食战士（战力随之破千）
  for (const k of WARRIOR_KEYS) grant(store, "warrior", k, 3);
  engine.checkAchievements();
  ok(store.hasAchievement("warriors_9"), "集齐 8 种战士解锁「美食全员」");
  ok(store.hasAchievement("power_1000"), "战力破千解锁「千钧一发」");
  ok(store.hasAchievement("power_5000"), "战力破五千解锁「万夫莫开」");

  // 攻略 + 建设全链路
  engine.attack(STRONGHOLDS[0].key);
  ok(store.hasAchievement("first_blood"), "首次损毁解锁「开门红」");
  ok(store.hasAchievement("first_conquer"), "首次攻略解锁「首战告捷」");
  const generalName = store.listUnits().find((u) => u.type === "general").name;
  engine.dispatchBuild(STRONGHOLDS[0].key, generalName);
  ok(store.hasAchievement("first_build"), "开启建设解锁「奠基之人」");
  for (let i = 0; i < 5; i++) {
    nextDay(store);
    grant(store, "jun", "jun", 1);
    engine.dispatchBuild(STRONGHOLDS[0].key, "");
  }
  ok(store.hasAchievement("first_built"), "第一座建成解锁「第一盏灯」");

  // 直接补全其余据点进度，验证终局两项
  for (const sh of STRONGHOLDS) {
    store.updateStronghold(sh.key, { damage: 5, conquered: 1, build_step: 5, built_at: "2026-10-12 12:00:00" });
  }
  engine.checkAchievements();
  ok(store.hasAchievement("conquer_all"), "全据点攻略解锁「九街归一」");
  ok(store.hasAchievement("empire_done"), "全据点建成解锁「麦麦帝国」");
  // 本流程未达成的长线成就：七日香火 / 20 家门店 / 十只动物 / 十位将军
  const finalView = engine.getState().achievements;
  ok(finalView.unlocked === 16, `本流程解锁 16 枚（实际 ${finalView.unlocked}）`);
  ok(["checkin_7", "stores_20", "animals_10", "generals_10"].every((k) => !finalView.items.find((a) => a.key === k).unlocked), "长线成就保持未解锁");

  engine.reset();
  ok(engine.getState().achievements.unlocked === 0, "重置后成就清零");
  store.close();
}

if (existsSync(DB)) rmSync(DB);
console.log(`\n自检完成：${passed} 通过，${failed} 失败\n`);
process.exit(failed > 0 ? 1 : 0);
