/**
 * 麦麦军团 · 游戏引擎
 *
 * 全部玩法规则都在这里，不依赖 HTTP 层（可被 server.mjs 或 CLI 复用）：
 *   签到 / 打卡 / 今日订单 / 偶遇 / 攻略（5 阶段）/ 建设（6 步）/ 图鉴
 */
import { UNITS, ANIMALS, STRONGHOLDS, WARRIOR_KEYS, ANIMAL_KEYS, BATTLE, DAILY, BUILD_RULES } from "./config.js";
import { CHARACTERS, ANIMALS as ANIMAL_STORY, STRONGHOLDS as SH_STORY, DAMAGE, BUILD, WORLD } from "./story.js";
import { pickDaily } from "./rng.js";
import { todayStr, nowLocalStr } from "../mcp/mcdApi.js";

const TOTAL_STRONGHOLDS = STRONGHOLDS.length;

export class LegionEngine {
  /**
   * @param {import("../store/LocalSqliteStore.js").LocalSqliteStore} store
   * @param {import("../mcp/mcdApi.js").McdApi} mcp
   */
  constructor(store, mcp) {
    this.store = store;
    this.mcp = mcp;
    store.ensurePlayer();
    store.ensureStrongholds(STRONGHOLDS.map((s) => s.key));
  }

  /* ================= 基础状态 ================= */

  /** 日期滚动：跨天后「仅当天存在」的动物离队 */
  rollover() {
    const today = todayStr();
    const player = this.store.getPlayer();
    if (player.updated_at?.slice(0, 10) !== today) {
      this.store.clearByType("animal");
      this.store.db
        .prepare("UPDATE player SET updated_at = ? WHERE id = 1")
        .run(nowLocalStr());
      return { rolled: true, date: today };
    }
    return { rolled: false, date: today };
  }

  /** 军团战力汇总 */
  army() {
    const units = this.store.listUnits();
    const detail = units.map((u) => {
      const def = UNITS[u.key] ?? ANIMALS[u.key];
      return {
        type: u.type,
        key: u.key,
        name: u.name,
        count: u.count,
        unitPower: def?.power ?? 0,
        power: (def?.power ?? 0) * u.count,
        def: def ?? null,
      };
    });
    const byType = { fan: 0, jun: 0, general: 0, warrior: 0, animal: 0 };
    let total = 0;
    for (const d of detail) {
      byType[d.type] = (byType[d.type] ?? 0) + d.power;
      total += d.power;
    }
    // 战斗中会损失的战力（麦麦将军与动物免疫）
    const vulnerable = byType.fan + byType.jun + byType.warrior;
    return { detail, byType, total, vulnerable };
  }

  /** 第一个未攻略据点（攻略前线） */
  frontier() {
    const rows = this.store.listStrongholds();
    for (const def of STRONGHOLDS) {
      const row = rows.find((r) => r.key === def.key);
      if (row && !row.conquered) return def.key;
    }
    return null;
  }

  strongholdView(key) {
    const def = STRONGHOLDS.find((s) => s.key === key);
    const row = this.store.getStronghold(key);
    const damage = row?.damage ?? 0;
    const buildStep = row?.build_step ?? -1;
    return {
      key,
      name: def.name,
      power: def.power,
      asset: def.asset,
      story: SH_STORY[key].story,
      damage,
      damageName: DAMAGE[damage].name,
      damageDesc: DAMAGE[damage].desc,
      conquered: Boolean(row?.conquered),
      buildStep,
      buildName: buildStep >= 0 ? BUILD[buildStep].name : null,
      buildDesc: buildStep >= 0 ? BUILD[buildStep].desc : null,
      built: buildStep >= BUILD_RULES.steps - 1,
      managerName: row?.manager_name ?? "",
      frontier: this.frontier() === key,
      unlocked: this.frontier() === key || Boolean(row?.conquered) || damage > 0,
    };
  }

  /** 完整状态（前端一次拉取） */
  getState() {
    const today = todayStr();
    this.rollover();
    const army = this.army();
    const daily = this.store.listDaily(today);
    const dailyMap = Object.fromEntries(daily.map((d) => [d.action, d]));
    const frontier = this.frontier();

    const strongholds = STRONGHOLDS.map((s) => this.strongholdView(s.key));
    const conquered = strongholds.filter((s) => s.conquered).length;
    const built = strongholds.filter((s) => s.built).length;

    let orderInfo = { claimed: false, rewarded: [] };
    if (dailyMap.order?.detail) {
      try {
        const parsed = JSON.parse(dailyMap.order.detail);
        orderInfo = { claimed: true, rewarded: parsed.rewarded ?? [] };
      } catch {
        /* 保留默认 */
      }
    }

    return {
      date: today,
      player: this.store.getPlayer(),
      mcp: this.mcp.status(),
      army,
      frontier,
      daily: {
        checkin: Boolean(dailyMap.checkin),
        encounter: Boolean(dailyMap.encounter),
        order: orderInfo,
        dispatch: Boolean(dailyMap.dispatch),
      },
      strongholds,
      empire: {
        conquered,
        built,
        total: TOTAL_STRONGHOLDS,
        done: built >= TOTAL_STRONGHOLDS,
      },
      animalsToday: army.detail.filter((d) => d.type === "animal"),
    };
  }

  /* ================= 每日行动 ================= */

  /** 签到：每日一次，收集麦麦粉 x1 */
  checkin() {
    this.rollover();
    const today = todayStr();
    if (this.store.getDaily(today, "checkin")) {
      throw new Error("今天已经签到过啦，明天再来");
    }
    this.store.addUnit("fan", "fan", "", DAILY.checkinFans);
    this.store.markDaily(today, "checkin", `麦麦粉 x${DAILY.checkinFans}`);
    return { gained: { key: "fan", count: DAILY.checkinFans } };
  }

  /** 打卡候选门店（来自 MCP 或演示数据） */
  async clockinStores() {
    return this.mcp.getStores();
  }

  /**
   * 打卡：同一门店一天一次。
   * 首次打卡且未拥有该店将军 → 获得该店麦麦将军 x1 + 麦麦军 x3；
   * 已拥有该店将军 → 仅获得麦麦军 x3。
   */
  async clockin(storeCode) {
    this.rollover();
    const today = todayStr();
    const { mode, stores } = await this.mcp.getStores();
    const store = stores.find((s) => String(s.storeCode) === String(storeCode));
    if (!store) throw new Error("没有找到该门店，请刷新列表");

    const clocked = this.store.db
      .prepare("SELECT 1 FROM clockin_log WHERE date = ? AND store_code = ?")
      .get(today, storeCode);
    if (clocked) throw new Error(`「${store.storeName}」今天已经打卡过了`);

    this.store.upsertStore(store);
    const existing = this.store.getStore(store.storeCode);
    const gotGeneral = !existing.has_general;

    if (gotGeneral) {
      this.store.addUnit("general", "general", store.storeName, DAILY.clockinGeneral);
    }
    this.store.addUnit("jun", "jun", "", DAILY.clockinJuns);
    this.store.recordClockin(store.storeCode, today, gotGeneral);

    return {
      mode,
      store,
      gotGeneral,
      gained: {
        generals: gotGeneral ? [{ name: store.storeName, count: 1 }] : [],
        juns: DAILY.clockinJuns,
      },
    };
  }

  /**
   * 今日订单奖励：当日每笔未领订单 → 1 名随机美食战士。
   * 订单来自麦当劳真实数据（order-list）；演示模式按日期生成。
   */
  async claimOrders() {
    this.rollover();
    const today = todayStr();
    const { mode, orders } = await this.mcp.getTodayOrders(today);
    const log = this.store.getDaily(today, "order");
    let rewarded = [];
    if (log?.detail) {
      try {
        rewarded = JSON.parse(log.detail).rewarded ?? [];
      } catch {
        rewarded = [];
      }
    }
    const fresh = orders.filter((o) => !rewarded.includes(o.orderId));
    const gains = [];
    for (const [i, order] of fresh.entries()) {
      const warriorKey = pickDaily(order.orderId, "warrior", i, WARRIOR_KEYS);
      this.store.addUnit("warrior", warriorKey, "", 1);
      gains.push({ warriorKey, order });
      rewarded.push(order.orderId);
    }
    if (fresh.length > 0 || !log) {
      this.store.markDaily(today, "order", JSON.stringify({ rewarded }));
    }
    return { mode, orderCount: orders.length, gained: gains };
  }

  /** 偶遇：每日一次，获得一只仅今天存在的小动物 */
  encounter() {
    this.rollover();
    const today = todayStr();
    if (this.store.getDaily(today, "encounter")) {
      throw new Error("今天已经偶遇过小动物了，明天再来");
    }
    const animalKey = pickDaily(today, "encounter", 0, ANIMAL_KEYS);
    this.store.addUnit("animal", animalKey, "", DAILY.encounterAnimals);
    this.store.markAnimalSeen(animalKey, today);
    this.store.markDaily(today, "encounter", animalKey);
    return { gained: { key: animalKey, count: DAILY.encounterAnimals } };
  }

  /* ================= 攻略 ================= */

  /**
   * 内部：对 working 副本施加一次约 30% 的战力损失。
   * 麦麦将军与动物免疫；从最弱的可损失单位开始消耗，
   * 采用「就近逼近」算法使总损失尽量贴近 30%（单位战力差异大，
   * 无法逐值精确，故以最接近目标为准）；
   * 若一个单位都未消耗（单个单位战力即超过目标），
   * 则至少消耗最弱的一个单位，保证每阶段都有战损。
   */
  _applyLoss(working) {
    const eligible = [];
    let eligiblePower = 0;
    for (const [composite, count] of working) {
      const [type, key, name] = composite.split("|");
      const def = UNITS[key];
      if (!def || def.survivesBattle) continue;
      if (count <= 0) continue;
      eligible.push({ composite, type, key, name, count, def });
      eligiblePower += def.power * count;
    }
    if (eligible.length === 0) {
      return { lostDetail: [], lostPower: 0 };
    }
    const target = eligiblePower * BATTLE.lossRate;
    const lostDetail = [];
    const lostMap = new Map(); // composite -> count
    let lostPower = 0;

    // 由弱到强
    eligible.sort((a, b) => a.def.power - b.def.power);
    for (let guard = 0; guard < 10000; guard++) {
      const unit = eligible.find((u) => working.get(u.composite) > 0);
      if (!unit) break;
      if (lostPower >= target) break;
      const wouldBe = lostPower + unit.def.power;
      // 消耗这个单位是否让总损失更接近 30% 目标？
      if (Math.abs(wouldBe - target) < Math.abs(lostPower - target)) {
        working.set(unit.composite, working.get(unit.composite) - 1);
        lostMap.set(unit.composite, (lostMap.get(unit.composite) ?? 0) + 1);
        lostPower = wouldBe;
      } else {
        break;
      }
    }
    // 保证至少损失一个最弱单位（除非没有可损失单位）
    if (lostPower === 0) {
      const unit = eligible.find((u) => working.get(u.composite) > 0);
      if (unit) {
        working.set(unit.composite, working.get(unit.composite) - 1);
        lostMap.set(unit.composite, (lostMap.get(unit.composite) ?? 0) + 1);
        lostPower += unit.def.power;
      }
    }

    for (const [composite, count] of lostMap) {
      const [type, key, name] = composite.split("|");
      const def = UNITS[key];
      lostDetail.push({ type, key, name, def, count, power: def.power * count });
    }
    return { lostDetail, lostPower };
  }

  /**
   * 攻略据点：共 5 个阶段，每阶段损失约 30% 战力
   * （麦麦将军与动物免疫）；损失后战力低于据点战力则被迫撤退，
   * 损毁进度保留，可改日再战。
   */
  attack(key) {
    this.rollover();
    const today = todayStr();
    const def = STRONGHOLDS.find((s) => s.key === key);
    if (!def) throw new Error("据点不存在");
    const row = this.store.getStronghold(key);
    if (row.conquered) throw new Error("该据点已被攻略");
    if (this.frontier() !== key) {
      throw new Error("请先攻略前一个据点");
    }

    const army = this.army();
    if (army.total <= def.power) {
      throw new Error(`战力不足：需要高于 ${def.power}，当前 ${army.total}`);
    }

    // 工作副本：composite = type|key|name
    const working = new Map();
    for (const d of army.detail) working.set(`${d.type}|${d.key}|${d.name}`, d.count);

    // 从当前损毁阶段继续：已损毁 damage 阶段，只需打完剩余阶段
    const startDamage = Math.min(row.damage, BATTLE.stages - 1);
    const stagesToDo = BATTLE.stages - startDamage;
    let curPower = army.total;
    const stages = [];
    let conquered = false;

    for (let i = 1; i <= stagesToDo; i++) {
      const loss = this._applyLoss(working);
      curPower -= loss.lostPower;
      const stageNo = startDamage + i;
      stages.push({
        stage: stageNo,
        lost: loss.lostDetail,
        lostPower: loss.lostPower,
        remainingPower: curPower,
      });
      if (i === stagesToDo) {
        conquered = true;
        break;
      }
      if (curPower < def.power) break; // 战力低于据点战力，无法继续攻略
    }

    // 持久化：写回剩余单位
    for (const [composite, count] of working) {
      const [type, key, name] = composite.split("|");
      this.store.setUnitCount(type, key, name, count);
    }

    const completedStages = startDamage + stages.length;
    const now = nowLocalStr();
    this.store.updateStronghold(key, {
      damage: Math.min(completedStages, BATTLE.stages),
      conquered: conquered ? 1 : 0,
      conquered_at: conquered ? now : "",
    });

    const result = {
      key,
      name: def.name,
      startPower: army.total,
      endPower: curPower,
      conquered,
      stages,
      damage: Math.min(completedStages, BATTLE.stages),
      fromDamage: startDamage,
    };
    this.store.addBattleLog({ date: today, stronghold: key, detail: result });
    return result;
  }

  /* ================= 建设 ================= */

  /**
   * 派遣建设：每日最多 1 次。
   * 首次派遣（开启建设）消耗 1 名麦麦将军出任店长；
   * 后续每次派遣消耗 1 名麦麦军，推进一个建设步骤（mm_0 → mm_5）。
   */
  dispatchBuild(key, generalName = "") {
    this.rollover();
    const today = todayStr();
    const def = STRONGHOLDS.find((s) => s.key === key);
    if (!def) throw new Error("据点不存在");
    const row = this.store.getStronghold(key);
    if (!row.conquered) throw new Error("该据点尚未攻略，无法建设");
    if (row.build_step >= BUILD_RULES.steps - 1) throw new Error("该据点已建设完成");
    if (this.store.getDaily(today, "dispatch")) {
      throw new Error("今天已经派遣过了，明天再来");
    }

    let consumed;
    let managerName = row.manager_name;
    if (row.build_step < 0) {
      // 开启建设：消耗一名麦麦将军
      if (!generalName) throw new Error("开启建设需要选择一名麦麦将军出任店长");
      if (this.store.getUnitCount("general", "general", generalName) < BUILD_RULES.openCostGeneral) {
        throw new Error("你的军团中没有这位麦麦将军");
      }
      this.store.removeUnit("general", "general", generalName, BUILD_RULES.openCostGeneral);
      // 将军来自某门店时，解除该门店「已拥有将军」标记，之后打卡可再次获得
      for (const s of this.store.listStores()) {
        if (s.store_name === generalName) this.store.markGeneralConsumed(s.store_code);
      }
      managerName = generalName;
      consumed = { type: "general", name: generalName, count: BUILD_RULES.openCostGeneral };
      this.store.updateStronghold(key, {
        build_step: 0,
        manager_name: managerName,
        last_dispatch_date: today,
      });
    } else {
      // 推进建设：消耗一名麦麦军
      if (this.store.getUnitCount("jun", "jun") < BUILD_RULES.stepCostJuns) {
        throw new Error("麦麦军不足，去打卡收集更多麦麦军吧");
      }
      this.store.removeUnit("jun", "jun", "", BUILD_RULES.stepCostJuns);
      const next = row.build_step + 1;
      consumed = { type: "jun", name: "", count: BUILD_RULES.stepCostJuns };
      this.store.updateStronghold(key, {
        build_step: next,
        last_dispatch_date: today,
        built_at: next >= BUILD_RULES.steps - 1 ? nowLocalStr() : "",
      });
    }
    this.store.markDaily(today, "dispatch", key);

    return {
      key,
      consumed,
      managerName,
      buildStep: this.store.getStronghold(key).build_step,
      buildName: BUILD[this.store.getStronghold(key).build_step].name,
      built: this.store.getStronghold(key).build_step >= BUILD_RULES.steps - 1,
    };
  }

  /* ================= 图鉴 ================= */

  /** 图鉴全量数据（含剧情文案） */
  codex() {
    this.rollover();
    const seen = new Map(this.store.listAnimalsSeen().map((a) => [a.key, a]));
    const animals = ANIMAL_KEYS.map((k) => {
      const s = seen.get(k);
      return {
        key: k,
        name: ANIMALS[k].name,
        asset: ANIMALS[k].asset,
        power: ANIMALS[k].power,
        story: ANIMAL_STORY[k].story,
        discovered: Boolean(s),
        firstSeen: s?.first_seen ?? "",
        seenCount: s?.seen_count ?? 0,
      };
    });

    const stores = this.store.listStores().map((s) => ({
      storeCode: s.store_code,
      storeName: s.store_name,
      address: s.address,
      firstClockin: s.first_clockin,
      lastClockin: s.last_clockin,
      clockinCount: s.clockin_count,
      hasGeneral: Boolean(s.has_general),
      isManager: STRONGHOLDS.some((def) => {
        const row = this.store.getStronghold(def.key);
        return row.manager_name === s.store_name && row.build_step >= 0;
      }),
    }));

    const ruins = STRONGHOLDS.filter((def) => {
      const row = this.store.getStronghold(def.key);
      return row.conquered || row.damage > 0;
    }).map((def) => {
      const row = this.store.getStronghold(def.key);
      return {
        key: def.key,
        name: def.name,
        damage: row.damage,
        conquered: Boolean(row.conquered),
        stages: DAMAGE.map((d, i) => ({
          stage: i,
          name: d.name,
          desc: d.desc,
          asset: `${def.asset}_${i}.png`,
          reached: i <= row.damage,
        })),
      };
    });

    return {
      animals,
      stores,
      ruins,
      characters: Object.entries(CHARACTERS).map(([key, c]) => ({
        key,
        name: c.name,
        story: c.story,
      })),
      strongholdStories: Object.entries(SH_STORY).map(([key, s]) => ({
        key,
        name: s.name,
        story: s.story,
      })),
      world: WORLD,
    };
  }

  /** 战报历史 */
  battles() {
    this.rollover();
    return this.store.listBattleLogs(30).map((b) => ({
      id: b.id,
      date: b.date,
      stronghold: b.stronghold,
      strongholdName: STRONGHOLDS.find((s) => s.key === b.stronghold)?.name ?? b.stronghold,
      detail: JSON.parse(b.detail),
    }));
  }

  /** 调试：重置全部进度 */
  reset() {
    this.store.db.exec(`
      DELETE FROM units; DELETE FROM stores; DELETE FROM daily_log;
      DELETE FROM clockin_log; DELETE FROM animal_seen;
      DELETE FROM strongholds; DELETE FROM battle_log;
    `);
    this.store.ensurePlayer();
    this.store.ensureStrongholds(STRONGHOLDS.map((s) => s.key));
  }
}
