/**
 * 麦麦军团 · 成就系统
 *
 * 20 枚成就徽章，按游戏内行为分七组：
 *   日常（签到/打卡/订单/偶遇）· 军团（将军/战力）·
 *   攻略（损毁/攻克）· 建设（奠基/建成/帝国）
 *
 * 每个成就字段：
 *   key    唯一标识（存于本地 achievements 表）
 *   name   成就名
 *   desc   解锁条件（成就殿堂中对未解锁者可见）
 *   flavor 解锁时展示的一句彩蛋文案（魔幻现实主义 + 冷幽默）
 *   tier   1 普通(青) / 2 精英(金) / 3 史诗(红)
 *   badge  徽章 SVG（与底部导航/行动图标同风格的线条图形：
 *          按 tier 区分奖牌框——圆形/六角/盾牌，内图为独特符号）
 */

/* 奖牌框：三种 tier 各一款，内图统一缩放在 24×24  viewBox 中心 */
const FRAME = {
  // 普通：双环圆形勋章
  t1: `<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="6.9" stroke-dasharray="1.6 2.4" opacity="0.65"/>`,
  // 精英：六角勋章
  t2: `<path d="M12 2.6 19.6 7.1v9.8L12 21.4 4.4 16.9V7.1L12 2.6z"/><path d="M12 5.2 17.3 8.2v7.6L12 18.8 6.7 15.8V8.2L12 5.2z" stroke-dasharray="1.6 2.4" opacity="0.65"/>`,
  // 史诗：盾牌勋章
  t3: `<path d="M12 2.4 4.4 5.5v6.5c0 5 3.3 8.6 7.6 10 4.3-1.4 7.6-5 7.6-10V5.5L12 2.4z"/><path d="M12 5 7 7.4v4.6c0 3.6 2.2 6.3 5 7.5 2.8-1.2 5-3.9 5-7.5V7.4L12 5z" stroke-dasharray="1.6 2.4" opacity="0.65"/>`,
};

/** 组合徽章：奖牌框 + 内图 */
function badge(tier, glyph) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${FRAME[tier]}${glyph}</svg>`;
}

/** 填充型小图形（爪印等），不吃 stroke 粗细、缩放到小尺寸也可读 */
function solid(glyph) {
  return `<svg viewBox="0 0 24 24" fill="currentColor" stroke="none">${glyph}</svg>`;
}

export const ACHIEVEMENTS = [
  /* ---------------- 日常 ---------------- */
  {
    key: "first_fan",
    name: "初入麦门",
    desc: "完成第一次签到",
    flavor: "从今天起，你也是一名有编制的麦麦粉了。",
    tier: 1,
    group: "日常",
    badge: badge("t1", `<rect x="8.2" y="7.6" width="7.6" height="7.2" rx="1"/><path d="M8.2 10h7.6M10.1 7.6V6M13.9 7.6V6"/><path d="M10.3 12.4l1.3 1.3 2.4-2.5"/>`),
  },
  {
    key: "checkin_7",
    name: "七日香火",
    desc: "累计签到满 7 天",
    flavor: "连续七天的虔诚，拱门都记在账上。",
    tier: 2,
    group: "日常",
    badge: badge("t2", `<path d="M12 5.4c1.7 2.6 3.8 3.7 3.8 6.6a3.8 3.8 0 0 1-7.6 0c0-2 1.1-3.2 2.1-4.2.2.9.7 1.4 1.5 1.5.1-1.4.1-2.7.2-3.9z"/><path d="M8 16.8c.5 1.6 2 2.6 4 2.6s3.5-1 4-2.6"/>`),
  },
  {
    key: "first_clockin",
    name: "第一站",
    desc: "完成第一次打卡",
    flavor: "第一座门店认领了你，将军们开始点名。",
    tier: 1,
    group: "日常",
    badge: badge("t1", `<path d="M12 14.6s-4.3-3.5-4.3-6.7a4.3 4.3 0 0 1 8.6 0c0 3.2-4.3 6.7-4.3 6.7z"/><path d="M10.5 12.3v-.9a1.5 1.5 0 0 1 3 0v.9"/>`),
  },
  {
    key: "stores_5",
    name: "巡城麦客",
    desc: "在 5 家不同门店打卡",
    flavor: "半座城市的灶火，都认得你的脚步声。",
    tier: 2,
    group: "日常",
    badge: badge("t2", `<circle cx="9.4" cy="9.2" r="1"/><circle cx="14.6" cy="9.2" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="9.4" cy="14.8" r="1"/><circle cx="14.6" cy="14.8" r="1"/>`),
  },
  {
    key: "stores_20",
    name: "麦门行者",
    desc: "在 20 家不同门店打卡",
    flavor: "二十家店的油烟，熏出了同一件披风。",
    tier: 3,
    group: "日常",
    badge: badge("t3", `<circle cx="12" cy="12" r="6.4"/><path d="M15.4 8.6 13 13l-4.4 2.4L11 11l4.4-2.4z"/>`),
  },
  {
    key: "first_order",
    name: "第一桶金",
    desc: "第一次领取今日订单奖励",
    flavor: "订单是当代军粮，战士由此出征。",
    tier: 1,
    group: "日常",
    badge: badge("t1", `<path d="M7.4 3.6h5.4l3.6 3.6v13.2H7.4V3.6z"/><path d="M12.8 3.6V7.2h3.6"/><path d="M10.2 11.6v3M10.2 13h2M12.2 11.6v3M9.6 14.8l1.6 1.7 1.6-1.7"/>`),
  },
  {
    key: "warriors_8",
    name: "美食全员",
    desc: "集齐 8 种美食战士",
    flavor: "八门八将，菜单就是花名册。",
    tier: 3,
    group: "日常",
    badge: badge("t3", `<path d="M4.4 17.6 2.9 7.2l5.4 3.9L12 4.6l3.7 6.5 5.4-3.9-1.5 10.4H4.4z"/><circle cx="12" cy="9.6" r=".9"/><circle cx="5.8" cy="10.6" r=".8"/><circle cx="18.2" cy="10.6" r=".8"/>`),
  },
  {
    key: "first_encounter",
    name: "命中注定",
    desc: "第一次偶遇小动物",
    flavor: "它只今天出现，却把名字留在了图鉴里。",
    tier: 1,
    group: "日常",
    badge: badge("t1", solid(`<ellipse cx="12" cy="14.9" rx="3.5" ry="2.9"/><circle cx="7.3" cy="11" r="1.45"/><circle cx="9.8" cy="8.7" r="1.45"/><circle cx="14.2" cy="8.7" r="1.45"/><circle cx="16.7" cy="11" r="1.45"/>`)),
  },
  {
    key: "animals_10",
    name: "动物缘满",
    desc: "图鉴集齐 10 只小动物",
    flavor: "十只小动物，轮流当过你的落日。",
    tier: 3,
    group: "日常",
    badge: badge("t3", `<circle cx="12" cy="12" r="8.3" stroke-dasharray="2 2"/>` + solid(`<ellipse cx="12" cy="14.6" rx="3.1" ry="2.6"/><circle cx="8" cy="11.2" r="1.3"/><circle cx="10.3" cy="9.1" r="1.3"/><circle cx="13.7" cy="9.1" r="1.3"/><circle cx="16" cy="11.2" r="1.3"/>`)),
  },

  /* ---------------- 军团 ---------------- */
  {
    key: "generals_5",
    name: "五虎聚义",
    desc: "同时拥有 5 名麦麦将军",
    flavor: "五家门店的灶火，凑成一张中军帐。",
    tier: 2,
    group: "军团",
    badge: badge("t2", `<path d="M6.6 20V4"/><path d="M6.6 4.6h10.8l-2.5 3.6 2.5 3.6H6.6"/>`),
  },
  {
    key: "generals_10",
    name: "十面威风",
    desc: "同时拥有 10 名麦麦将军",
    flavor: "十位将军同时点头，整条街稳如刚出锅的薯条。",
    tier: 3,
    group: "军团",
    badge: badge("t3", `<path d="M6.2 6.2 17.8 17.8M17.8 6.2 6.2 17.8"/><circle cx="6.2" cy="6.2" r="1.3"/><circle cx="17.8" cy="6.2" r="1.3"/><circle cx="6.2" cy="17.8" r="1.3"/><circle cx="17.8" cy="17.8" r="1.3"/>`),
  },
  {
    key: "power_1000",
    name: "千钧一发",
    desc: "军团战力达到 1,000",
    flavor: "一千点战力，约等于一百包薯条同时变脆。",
    tier: 2,
    group: "军团",
    badge: badge("t2", `<path d="M13.2 3.2 6.4 13.4h4.2l-1 7.4 7-10.6h-4.2l.8-7z"/>`),
  },
  {
    key: "power_5000",
    name: "万夫莫开",
    desc: "军团战力达到 5,000",
    flavor: "五千战力过处，敌商的卷帘门瑟瑟发抖。",
    tier: 3,
    group: "军团",
    badge: badge("t3", `<path d="M12 3.4c1.9 2.7 3.4 4 3.4 6.5a3.4 3.4 0 0 1-6.8 0c0-1.5.8-2.7 1.7-3.8.2.9.7 1.3 1.4 1.5.1-1.4.1-2.8.3-4.2z"/><path d="M9.6 13.4h4.8l-.7 7.2h-3.4l-.7-7.2z"/>`),
  },

  /* ---------------- 攻略 ---------------- */
  {
    key: "first_blood",
    name: "开门红",
    desc: "第一次损毁据点",
    flavor: "第一道裂缝，往往从一块橱玻璃开始。",
    tier: 1,
    group: "攻略",
    badge: badge("t1", `<path d="M12 3.6v4l-2.6 2.6 2.6 2.6v3.6"/><path d="M9.4 10.2 6.6 8.6M14.6 15.8l2.9 1.5M9.4 10.2 6 12M14.6 15.8l2.6-2.3"/>`),
  },
  {
    key: "first_conquer",
    name: "首战告捷",
    desc: "第一次成功攻略据点",
    flavor: "第一块地盘到手，将军们终于敢大声点菜。",
    tier: 2,
    group: "攻略",
    badge: badge("t2", `<path d="M8 17.2c-2.4-1-3.9-3.1-3.9-5.8 2.7.3 4.5 1.5 5.4 3.3M16 17.2c2.4-1 3.9-3.1 3.9-5.8-2.7.3-4.5 1.5-5.4 3.3"/><path d="M12 4.6l1.4 3 3.3.5-2.4 2.3.6 3.3-2.9-1.6-2.9 1.6.6-3.3-2.4-2.3 3.3-.5 1.4-3z"/>`),
  },
  {
    key: "conquer_5",
    name: "半壁江山",
    desc: "累计攻略 5 座据点",
    flavor: "五条街易主，帝国的版图过了中线。",
    tier: 2,
    group: "攻略",
    badge: badge("t2", `<path d="M5.2 18.4a7.6 7.6 0 0 1 13.6 0"/><circle cx="12" cy="9.4" r="1"/><circle cx="8.3" cy="12.1" r="1"/><circle cx="15.7" cy="12.1" r="1"/><circle cx="6.5" cy="15.7" r="1"/><circle cx="17.5" cy="15.7" r="1"/>`),
  },
  {
    key: "conquer_all",
    name: "九街归一",
    desc: "攻略全部 9 座据点",
    flavor: "九条街的油烟，从此只朝一个方向飘。",
    tier: 3,
    group: "攻略",
    badge: badge("t3", `<path d="M4.4 18 2.9 7.2l5.4 3.9L12 4.6l3.7 6.5 5.4-3.9L19.6 18H4.4z"/><path d="M4.4 20.4h15.2"/>`),
  },

  /* ---------------- 建设 ---------------- */
  {
    key: "first_build",
    name: "奠基之人",
    desc: "第一次开启据点建设",
    flavor: "第一方混凝土，是一位将军脱下围裙浇下的。",
    tier: 1,
    group: "建设",
    badge: badge("t1", `<path d="M3.6 20.4h16.8M6 20.4v-6.2l6-3.8 6 3.8v6.2"/><path d="M9.9 20.4v-3.7h4.2v3.7"/>`),
  },
  {
    key: "first_built",
    name: "第一盏灯",
    desc: "第一座麦麦据点建成",
    flavor: "第一盏灯亮到深夜，赶路人又有地方去了。",
    tier: 2,
    group: "建设",
    badge: badge("t2", `<path d="M6.6 20.4v-7.2a5.4 5.4 0 0 1 10.8 0v7.2"/><path d="M12 8.2V5.8M9.2 6.6l1.5 1.5M14.8 6.6l-1.5 1.5"/>`),
  },
  {
    key: "empire_done",
    name: "麦麦帝国",
    desc: "九座据点全部建成",
    flavor: "九座拱门次第亮起——欢迎回家，帝国的奠基者。",
    tier: 3,
    group: "建设",
    badge: badge("t3", `<path d="M4 21V11a8 8 0 0 1 16 0v10"/><path d="M4 21h16"/><path d="M7.6 21v-4.6M16.4 21v-4.6"/><path d="M8.2 6.6 12 3.2l3.8 3.4-3.8 2.6-3.8-2.6z"/>`),
  },
];

/** 查询单个成就定义 */
export function getAchievement(key) {
  return ACHIEVEMENTS.find((a) => a.key === key) ?? null;
}

/** 成就总数 */
export const ACHIEVEMENT_TOTAL = ACHIEVEMENTS.length;
