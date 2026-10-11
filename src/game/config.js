/**
 * 麦麦军团 · 游戏数值配置
 *
 * 所有平衡性数值集中在此，调难度只改这一个文件。
 * 剧情文案在 story.js。
 */

/** 战力损毁规则：每阶段损失比例（麦麦将军与动物免疫） */
export const BATTLE = {
  stages: 5,
  lossRate: 0.3,        // 每阶段损失约 30% 战力
  // 继续攻略判定：损失后战力 >= 据点战力即可继续；开局需 > 据点战力
};

/** 每日行动 */
export const DAILY = {
  checkinFans: 1,          // 签到：麦麦粉 x1
  clockinJuns: 3,          // 打卡：麦麦军 x3
  clockinGeneral: 1,       // 打卡：麦麦将军 x1（首次且未拥有该店将军时）
  encounterAnimals: 1,     // 偶遇：动物 x1（仅当天有效）
};

/** 建设规则 */
export const BUILD_RULES = {
  steps: 6,                // mm_0 地基 → mm_5 完成
  openCostGeneral: 1,      // 开启建设消耗麦麦将军 x1（任命为店长）
  stepCostJuns: 1,         // 每次派遣消耗麦麦军 x1
  dispatchPerDay: 1,       // 每日最多派遣 1 次
};

/**
 * 单位定义。
 * tier 用于卡片展示与战力标签：1 普通 / 2 精英 / 3 史诗
 * survivesBattle=true 的单位在攻略中不会损失。
 */
export const UNITS = {
  fan: {
    type: "fan", name: "麦麦粉", power: 10, tier: 1,
    asset: "units/fan_male.png", altAsset: "units/fan_female.png",
    survivesBattle: false, group: "麦麦军团",
  },
  jun: {
    type: "jun", name: "麦麦军", power: 35, tier: 1,
    asset: "units/jun.png",
    survivesBattle: false, group: "麦麦军团",
  },
  general: {
    type: "general", name: "麦麦将军", power: 180, tier: 2,
    asset: "units/general.png", named: true,
    survivesBattle: true, group: "麦麦军团",
  },
  warrior_fries: {
    type: "warrior", name: "薯条剑士", power: 160, tier: 2,
    asset: "units/warrior_fries.png",
    survivesBattle: false, group: "美食战士",
  },
  warrior_spicychicken: {
    type: "warrior", name: "麦辣鸡腿堡战士", power: 220, tier: 2,
    asset: "units/warrior_spicychicken.png",
    survivesBattle: false, group: "美食战士",
  },
  warrior_cola: {
    type: "warrior", name: "可乐枪炮兵", power: 180, tier: 2,
    asset: "units/warrior_cola.png",
    survivesBattle: false, group: "美食战士",
  },
  warrior_mcflurry: {
    type: "warrior", name: "麦旋风法师", power: 200, tier: 2,
    asset: "units/warrior_mcflurry.png",
    survivesBattle: false, group: "美食战士",
  },
  warrior_muffin: {
    type: "warrior", name: "早餐麦满分守卫", power: 240, tier: 2,
    asset: "units/warrior_muffin.png",
    survivesBattle: false, group: "美食战士",
  },
  warrior_coffee: {
    type: "warrior", name: "咖啡苦行僧", power: 210, tier: 2,
    asset: "units/warrior_coffee.png",
    survivesBattle: false, group: "美食战士",
  },
  warrior_bigmac: {
    type: "warrior", name: "巨无霸泰坦", power: 260, tier: 3,
    asset: "units/warrior_bigmac.png",
    survivesBattle: false, group: "美食战士",
  },
  warrior_arch: {
    type: "warrior", name: "黄金拱门守卫", power: 250, tier: 3,
    asset: "units/warrior_arch.png",
    survivesBattle: false, group: "美食战士",
  },
};

/** 十只偶遇动物：仅当天有效，战力当天计入军团 */
export const ANIMALS = {
  husky: { type: "animal", name: "哈士奇", power: 120, tier: 2, asset: "animals/husky.png" },
  samoyed: { type: "animal", name: "萨摩耶", power: 110, tier: 2, asset: "animals/samoyed.png" },
  golden: { type: "animal", name: "金毛", power: 100, tier: 2, asset: "animals/golden.png" },
  corgi: { type: "animal", name: "柯基", power: 90, tier: 1, asset: "animals/corgi.png" },
  shiba: { type: "animal", name: "柴犬", power: 85, tier: 1, asset: "animals/shiba.png" },
  orange: { type: "animal", name: "橘猫", power: 130, tier: 2, asset: "animals/orange.png" },
  calico: { type: "animal", name: "奶牛猫", power: 95, tier: 1, asset: "animals/calico.png" },
  tabby: { type: "animal", name: "灰虎斑", power: 80, tier: 1, asset: "animals/tabby.png" },
  white: { type: "animal", name: "白猫", power: 105, tier: 2, asset: "animals/white.png" },
  black: { type: "animal", name: "黑猫", power: 140, tier: 3, asset: "animals/black.png" },
};

/**
 * 九个攻略据点（按攻略顺序）。
 * power：据点战力；开局战力需 > power，每阶段损失 30% 后仍需 >= power。
 * 难度曲线设计：第一天可攻略完第一据点，之后约 2~4 天攻克一个。
 */
export const STRONGHOLDS = [
  { key: "cheap", name: "县城街边底商", power: 60, asset: "strongholds/cheap" },
  { key: "chicken", name: "极窄炸鸡档口", power: 130, asset: "strongholds/chicken" },
  { key: "tea", name: "街边茶饮档口", power: 250, asset: "strongholds/tea" },
  { key: "coffee", name: "玻璃快取亭", power: 420, asset: "strongholds/coffee" },
  { key: "store", name: "街角玻璃便利店", power: 650, asset: "strongholds/store" },
  { key: "cburger", name: "中式仿古小楼", power: 950, asset: "strongholds/cburger" },
  { key: "burger", name: "停车场独栋大店", power: 1350, asset: "strongholds/burger" },
  { key: "pizza", name: "披萨休闲餐厅", power: 1850, asset: "strongholds/pizza" },
  { key: "grandpa", name: "独栋快餐店", power: 2500, asset: "strongholds/grandpa" },
];

/** 图鉴分类 */
export const CODEX = {
  animals: "动物图鉴",
  stores: "打卡地",
  ruins: "据点损毁图鉴",
};

/** 离线演示模式：未配置 MCD_MCP_TOKEN 时使用的示例数据 */
export const MOCK = {
  stores: [
    { storeCode: "DEMO-001", storeName: "麦当劳(示例)美食广场餐厅", address: "示例市朝阳区美食广场 B1" },
    { storeCode: "DEMO-002", storeName: "麦当劳(示例)高新园得来速餐厅", address: "示例市高新区科技园大道 88 号" },
    { storeCode: "DEMO-003", storeName: "麦当劳(示例)滨江步行街餐厅", address: "示例市滨江区步行街 12 号" },
    { storeCode: "DEMO-004", storeName: "麦当劳(示例)中央车站餐厅", address: "示例市车站南路中央车站 2 层" },
    { storeCode: "DEMO-005", storeName: "麦当劳(示例)大学城店", address: "示例市大学城文昌路 5 号" },
    { storeCode: "DEMO-006", storeName: "麦当劳(示例)湖畔公园餐厅", address: "示例市湖畔公园西门" },
    { storeCode: "DEMO-007", storeName: "麦当劳(示例)万象汇店", address: "示例市万象汇购物中心 L3" },
    { storeCode: "DEMO-008", storeName: "麦当劳(示例)机场 T3 航站楼店", address: "示例市国际机场 T3 出发层" },
  ],
  /** 演示模式按日期确定性生成今日订单数（1~3 单） */
  orderCountByDate: (dateStr) => {
    let h = 0;
    for (const ch of dateStr) h = (h * 31 + ch.charCodeAt(0)) % 997;
    return 1 + (h % 3);
  },
};

/** 查询工具函数 */
export function getUnit(key) {
  return UNITS[key] ?? ANIMALS[key] ?? null;
}

export function getStronghold(key) {
  return STRONGHOLDS.find((s) => s.key === key) ?? null;
}

/** 美食战士 key 列表（订单奖励随机池） */
export const WARRIOR_KEYS = Object.keys(UNITS).filter((k) => UNITS[k].type === "warrior");

/** 动物 key 列表（偶遇随机池） */
export const ANIMAL_KEYS = Object.keys(ANIMALS);

/** 战力名称 */
export function powerLabel(power) {
  if (power >= 10000) return `${(power / 10000).toFixed(1)} 万`;
  return String(power);
}
