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
import { STRONGHOLDS, WARRIOR_KEYS, ANIMAL_KEYS, ANIMALS } from "../src/game/config.js";
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

  // 切换城市后，门店不在默认城市结果里：用前端传来的门店快照也应打卡成功
  const other = { storeCode: "OTHER-CITY-1", storeName: "麦当劳(其他城市)测试餐厅", address: "测试路 1 号" };
  let err2 = null;
  let r4 = null;
  try {
    r4 = await engine.clockin(other.storeCode, "其他城市", other);
  } catch (e) {
    err2 = e;
  }
  ok(err2 === null && r4?.store?.storeName === other.storeName, "可用前端门店快照打卡（不依赖默认城市）");
  ok(store.getUnitCount("general", "general", other.storeName) === 1, "快照门店的将军同样入库");

  // 每日打卡上限：同一天最多 3 次（当前已打 2 次：target + other）
  ok(engine.clockinCount() === 2, "今日打卡计数为 2");
  const third = { storeCode: "LIMIT-3", storeName: "第三家测试餐厅", address: "" };
  const r5 = await engine.clockin(third.storeCode, "测试", third);
  ok(r5.clockin.done === 3 && r5.clockin.limit === 3, "第 3 次打卡成功，返回进度 3/3");

  let overErr = null;
  const fourth = { storeCode: "LIMIT-4", storeName: "第四家测试餐厅", address: "" };
  try {
    await engine.clockin(fourth.storeCode, "测试", fourth);
  } catch (e) { overErr = e; }
  ok(overErr !== null && /上限/.test(overErr.message), "同一天第 4 次打卡被每日上限拦截");
  // 前 5 次成功发放（3×5），被拦截的第 4 次不发放
  ok(store.getUnitCount("jun", "jun") === 3 * 5, "被拦截的那次没有发放麦麦军（仍为 15）");

  // 跨天后计数归零，可以重新打卡
  nextDay(store);
  ok(engine.clockinCount() === 0, "跨天后今日打卡计数归零");
  const r6 = await engine.clockin(third.storeCode, "测试", third);
  ok(r6.clockin.done === 1, "新的一天可以重新打卡");
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

console.log("\n[6b] 偶遇动物每天仅一只（重复行自愈）");
{
  const { store, engine } = freshEngine();
  engine.encounter();
  let err = null;
  try {
    engine.encounter();
  } catch (e) {
    err = e;
  }
  ok(err !== null, "同一天只能偶遇一次");
  const rows = store.db.prepare("SELECT * FROM units WHERE type = 'animal'").all();
  ok(rows.length === 1, "units 中动物仅一行", `实际 ${rows.length} 行`);
  ok(rows[0].name === "", "动物行 name 为空（不与别名行冲突）");

  // 模拟历史遗留数据：同一只动物还存着一条 name 非空的别名行
  store.db
    .prepare("INSERT INTO units (type, key, name, count) VALUES ('animal', ?, '落日', 1)")
    .run(rows[0].key);
  ok(
    store.db.prepare("SELECT COUNT(*) AS n FROM units WHERE type = 'animal'").get().n === 2,
    "构造出重复的两行"
  );
  const armyDup = engine.army().detail.filter((u) => u.type === "animal");
  ok(armyDup.length === 2, "修复前军团里会渲染成 2 张动物卡片");

  const fixed = store.normalizeAnimals();
  ok(fixed === 1, "normalizeAnimals 修复 1 种动物");
  const after = store.db.prepare("SELECT * FROM units WHERE type = 'animal'").all();
  ok(after.length === 1 && after[0].name === "", "重复行合并为一行且 name 统一为空");
  ok(engine.army().detail.filter((u) => u.type === "animal").length === 1, "修复后军团里只有 1 张卡片");
  store.close();
}

console.log("\n[6c] 新引擎启动时自愈历史重复动物");
{
  const { store, engine } = freshEngine();
  engine.encounter();
  const key = store.db.prepare("SELECT key FROM units WHERE type = 'animal'").get().key;
  store.db
    .prepare("INSERT INTO units (type, key, name, count) VALUES ('animal', ?, '别名', 1)")
    .run(key);
  store.close();
  // 复用同一数据库文件新建引擎：构造函数应自动归一化
  const store2 = new LocalSqliteStore(DB);
  const engine2 = new LegionEngine(store2, new McdApi());
  ok(
    store2.db.prepare("SELECT COUNT(*) AS n FROM units WHERE type = 'animal'").get().n === 1,
    "引擎启动时自动合并重复动物行"
  );
  ok(engine2.army().detail.filter((u) => u.type === "animal").length === 1, "自愈后仅一张动物卡片");
  store2.close();
}

console.log("\n[6d] 攻略据点不会把当日动物复制成两只");
{
  const { store, engine } = freshEngine();
  engine.encounter();
  const animalKey = store.db.prepare("SELECT key FROM units WHERE type = 'animal'").get().key;
  grant(store, "warrior", "warrior_bigmac", 40); // 足以通关第一个据点
  const res = engine.attack(STRONGHOLDS[0].key);
  ok(res.conquered, "据点已攻略（动物在队时出战）");

  const rows = store.db.prepare("SELECT key, name, count FROM units WHERE type = 'animal'").all();
  ok(rows.length === 1, "攻略后动物仍只有一行", `实际 ${rows.length} 行`);
  ok(rows[0].name === "", "写回时用的仍是存储名 ''（不会写成展示名）");
  const cards = engine.army().detail.filter((u) => u.type === "animal");
  ok(cards.length === 1, "军团里只有 1 张动物卡片");
  ok(cards[0].name === (ANIMALS[animalKey].title ?? ANIMALS[animalKey].name), "展示名仍为动物的专属名字");
  ok(cards[0].count === 1, "动物战力未被战斗消耗（免疫战损）");
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
  // 每日打卡上限 3 次，5 家门店需跨两天完成
  for (let i = 0; i < 3; i++) await engine.clockin(stores[i].storeCode);
  nextDay(store);
  for (let i = 3; i < 5; i++) await engine.clockin(stores[i].storeCode);
  ok(store.hasAchievement("first_clockin"), "首次打卡解锁「第一站」");
  ok(store.hasAchievement("stores_5"), "5 家门店解锁「巡城麦客」");
  ok(store.hasAchievement("generals_5"), "同时 5 名将军解锁「五虎聚义」");

  engine.encounter();
  ok(store.hasAchievement("first_encounter"), "首次偶遇解锁「命中注定」");

  // 集齐 8 种美食战士（战力随之破千）
  for (const k of WARRIOR_KEYS) grant(store, "warrior", k, 3);
  engine.checkAchievements();
  ok(store.hasAchievement("warriors_8"), "集齐 8 种战士解锁「美食全员」");
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
