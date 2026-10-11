-- 麦麦军团 · 本地数据库表结构（SQLite / node:sqlite）
-- 用户数据全部存储在本地 data/mcm-legion.db，不上传任何服务器。

-- 玩家（单账号本地游戏）
CREATE TABLE IF NOT EXISTS player (
  id         INTEGER PRIMARY KEY CHECK (id = 1),
  nickname   TEXT    NOT NULL DEFAULT '麦麦元帅',
  created_at TEXT    NOT NULL,
  updated_at TEXT
);

-- 单位库存
-- type: fan(麦麦粉) / jun(麦麦军) / general(麦麦将军) / warrior(美食战士) / animal(偶遇动物，仅当天)
-- key : 单位 key，如 fan / jun / general / warrior_fries / animal_husky
-- name: 麦麦将军的门店名（其他单位留空）
CREATE TABLE IF NOT EXISTS units (
  type  TEXT    NOT NULL,
  key   TEXT    NOT NULL,
  name  TEXT    NOT NULL DEFAULT '',
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (type, key, name)
);

-- 打卡地（图鉴之二）
CREATE TABLE IF NOT EXISTS stores (
  store_code     TEXT PRIMARY KEY,
  store_name     TEXT    NOT NULL,
  address        TEXT    NOT NULL DEFAULT '',
  first_clockin  TEXT    NOT NULL DEFAULT '',
  last_clockin   TEXT    NOT NULL DEFAULT '',
  clockin_count  INTEGER NOT NULL DEFAULT 0,
  has_general    INTEGER NOT NULL DEFAULT 0   -- 当前是否拥有该店将军（被建设消耗后置 0，可再次打卡获得）
);

-- 每日行动记录（date+action 唯一，保证一天一次）
CREATE TABLE IF NOT EXISTS daily_log (
  date       TEXT NOT NULL,
  action     TEXT NOT NULL,   -- checkin / encounter / order / dispatch
  detail     TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  PRIMARY KEY (date, action)
);

-- 打卡流水（同一门店一天一次）
CREATE TABLE IF NOT EXISTS clockin_log (
  date         TEXT NOT NULL,
  store_code   TEXT NOT NULL,
  got_general  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (date, store_code)
);

-- 动物图鉴（图鉴之一）
CREATE TABLE IF NOT EXISTS animal_seen (
  key        TEXT PRIMARY KEY,
  first_seen TEXT NOT NULL DEFAULT '',
  seen_count INTEGER NOT NULL DEFAULT 0
);

-- 攻略据点进度
-- damage    : 0~5 损毁阶段（5 = 完全损毁）
-- conquered : 是否已攻略
-- build_step: -1 未开启建设；0~5 建设进度（对应 mm_0~mm_5，5 = 建成）
CREATE TABLE IF NOT EXISTS strongholds (
  key                TEXT PRIMARY KEY,
  damage             INTEGER NOT NULL DEFAULT 0,
  conquered          INTEGER NOT NULL DEFAULT 0,
  build_step         INTEGER NOT NULL DEFAULT -1,
  manager_name       TEXT    NOT NULL DEFAULT '',
  last_dispatch_date TEXT    NOT NULL DEFAULT '',
  conquered_at       TEXT    NOT NULL DEFAULT '',
  built_at           TEXT    NOT NULL DEFAULT ''
);

-- 攻略战报
CREATE TABLE IF NOT EXISTS battle_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  date        TEXT NOT NULL,
  stronghold  TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  detail      TEXT NOT NULL           -- JSON：各阶段损失明细
);
