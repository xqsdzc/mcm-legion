/**
 * 麦麦军团 · 本地存储层（SQLite via node:sqlite）
 *
 * 只依赖 Node 内置 node:sqlite，零外部依赖。
 * 业务逻辑不直接碰 SQL，全部经由本类方法；将来要迁云端，
 * 实现同样签名的 CloudStore 即可，engine.js 无需改动。
 */
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { nowLocalStr } from "../mcp/mcdApi.js";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export class LocalSqliteStore {
  /**
   * @param {string} dbPath 数据库文件路径
   */
  constructor(dbPath) {
    this.db = new DatabaseSync(dbPath);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");
    const schema = readFileSync(join(__dirname, "schema.sql"), "utf8");
    this.db.exec(schema);
  }

  close() {
    this.db.close();
  }

  /* ---------------- 玩家 ---------------- */

  ensurePlayer(nickname = "麦麦元帅") {
    const now = nowLocalStr();
    this.db
      .prepare(
        `INSERT INTO player (id, nickname, created_at, updated_at)
         VALUES (1, ?, ?, ?)
         ON CONFLICT(id) DO NOTHING`
      )
      .run(nickname, now, now);
    return this.getPlayer();
  }

  getPlayer() {
    return this.db.prepare("SELECT * FROM player WHERE id = 1").get();
  }

  /* ---------------- 单位库存 ---------------- */

  listUnits() {
    return this.db.prepare("SELECT * FROM units WHERE count > 0 ORDER BY type, key, name").all();
  }

  getUnitCount(type, key, name = "") {
    const row = this.db
      .prepare("SELECT count FROM units WHERE type = ? AND key = ? AND name = ?")
      .get(type, key, name);
    return row ? row.count : 0;
  }

  addUnit(type, key, name = "", count = 1) {
    this.db
      .prepare(
        `INSERT INTO units (type, key, name, count) VALUES (?, ?, ?, ?)
         ON CONFLICT(type, key, name) DO UPDATE SET count = count + excluded.count`
      )
      .run(type, key, name, count);
  }

  /** 扣除单位，返回实际扣除数量（库存不足时扣 0） */
  removeUnit(type, key, name = "", count = 1) {
    const have = this.getUnitCount(type, key, name);
    const take = Math.min(have, count);
    if (take <= 0) return 0;
    this.db
      .prepare("UPDATE units SET count = count - ? WHERE type = ? AND key = ? AND name = ?")
      .run(take, type, key, name);
    return take;
  }

  /** 直接设置数量（用于战斗损毁结算） */
  setUnitCount(type, key, name, count) {
    if (count <= 0) {
      this.db
        .prepare("DELETE FROM units WHERE type = ? AND key = ? AND name = ?")
        .run(type, key, name);
      return;
    }
    this.db
      .prepare(
        `INSERT INTO units (type, key, name, count) VALUES (?, ?, ?, ?)
         ON CONFLICT(type, key, name) DO UPDATE SET count = excluded.count`
      )
      .run(type, key, name, count);
  }

  clearByType(type) {
    this.db.prepare("DELETE FROM units WHERE type = ?").run(type);
  }

  /* ---------------- 打卡地 ---------------- */

  upsertStore({ storeCode, storeName, address = "" }) {
    this.db
      .prepare(
        `INSERT INTO stores (store_code, store_name, address, first_clockin, last_clockin, clockin_count, has_general)
         VALUES (?, ?, ?, '', '', 0, 0)
         ON CONFLICT(store_code) DO UPDATE SET store_name = excluded.store_name, address = excluded.address`
      )
      .run(storeCode, storeName, address);
  }

  getStore(storeCode) {
    return this.db.prepare("SELECT * FROM stores WHERE store_code = ?").get(storeCode);
  }

  listStores() {
    return this.db.prepare("SELECT * FROM stores ORDER BY first_clockin ASC").all();
  }

  recordClockin(storeCode, date, gotGeneral) {
    const store = this.getStore(storeCode);
    if (!store) return;
    this.db
      .prepare(
        `UPDATE stores SET clockin_count = clockin_count + 1,
                           last_clockin = ?,
                           first_clockin = CASE WHEN first_clockin = '' THEN ? ELSE first_clockin END,
                           has_general = CASE WHEN ? THEN 1 ELSE has_general END
         WHERE store_code = ?`
      )
      .run(date, date, gotGeneral ? 1 : 0, storeCode);
    this.db
      .prepare(
        `INSERT INTO clockin_log (date, store_code, got_general) VALUES (?, ?, ?)
         ON CONFLICT(date, store_code) DO UPDATE SET got_general = excluded.got_general`
      )
      .run(date, storeCode, gotGeneral ? 1 : 0);
  }

  /** 标记某店将军已被消耗（可再次打卡获得） */
  markGeneralConsumed(storeCode) {
    this.db.prepare("UPDATE stores SET has_general = 0 WHERE store_code = ?").run(storeCode);
  }

  /* ---------------- 每日行动 ---------------- */

  getDaily(date, action) {
    return this.db
      .prepare("SELECT * FROM daily_log WHERE date = ? AND action = ?")
      .get(date, action);
  }

  listDaily(date) {
    return this.db.prepare("SELECT * FROM daily_log WHERE date = ?").all(date);
  }

  /** 历史上是否执行过某行动（不限日期，用于「首次签到」判断） */
  hasAnyDaily(action) {
    return Boolean(
      this.db.prepare("SELECT 1 FROM daily_log WHERE action = ? LIMIT 1").get(action)
    );
  }

  markDaily(date, action, detail = "") {
    const now = nowLocalStr();
    this.db
      .prepare(
        `INSERT INTO daily_log (date, action, detail, created_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(date, action) DO UPDATE SET detail = excluded.detail, created_at = excluded.created_at`
      )
      .run(date, action, detail, now);
  }

  /* ---------------- 动物图鉴 ---------------- */

  markAnimalSeen(key, date) {
    this.db
      .prepare(
        `INSERT INTO animal_seen (key, first_seen, seen_count) VALUES (?, ?, 1)
         ON CONFLICT(key) DO UPDATE SET seen_count = seen_count + 1`
      )
      .run(key, date);
  }

  listAnimalsSeen() {
    return this.db.prepare("SELECT * FROM animal_seen ORDER BY first_seen ASC").all();
  }

  /* ---------------- 据点进度 ---------------- */

  ensureStrongholds(keys) {
    const stmt = this.db.prepare(
      "INSERT OR IGNORE INTO strongholds (key) VALUES (?)"
    );
    for (const k of keys) stmt.run(k);
  }

  getStronghold(key) {
    return this.db.prepare("SELECT * FROM strongholds WHERE key = ?").get(key);
  }

  listStrongholds() {
    return this.db.prepare("SELECT * FROM strongholds").all();
  }

  updateStronghold(key, fields) {
    const cols = Object.keys(fields);
    if (cols.length === 0) return;
    const sets = cols.map((c) => `${c} = ?`).join(", ");
    this.db
      .prepare(`UPDATE strongholds SET ${sets} WHERE key = ?`)
      .run(...cols.map((c) => fields[c]), key);
  }

  /* ---------------- 战报 ---------------- */

  addBattleLog({ date, stronghold, detail }) {
    this.db
      .prepare(
        "INSERT INTO battle_log (date, stronghold, created_at, detail) VALUES (?, ?, ?, ?)"
      )
      .run(date, stronghold, nowLocalStr(), JSON.stringify(detail));
  }

  listBattleLogs(limit = 30) {
    return this.db
      .prepare("SELECT * FROM battle_log ORDER BY id DESC LIMIT ?")
      .all(limit);
  }

  /* ---------------- 成就 ---------------- */

  listAchievements() {
    return this.db.prepare("SELECT * FROM achievements ORDER BY unlocked_at ASC, key ASC").all();
  }

  hasAchievement(key) {
    return Boolean(this.db.prepare("SELECT 1 FROM achievements WHERE key = ?").get(key));
  }

  /** 解锁成就（已解锁则忽略，返回是否为新解锁） */
  unlockAchievement(key, at) {
    const r = this.db
      .prepare("INSERT OR IGNORE INTO achievements (key, unlocked_at) VALUES (?, ?)")
      .run(key, at);
    return r.changes > 0;
  }
}
