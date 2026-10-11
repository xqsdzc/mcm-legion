/**
 * 带种子的伪随机数（mulberry32）。
 * 同一日期 + 同一序号 → 结果固定，保证「每日偶遇/订单奖励」可复现、可测试。
 */

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 字符串 → 32 位种子 */
export function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * 按「日期 + 用途」生成当天的确定性随机序列。
 * @param {string} dateStr YYYY-MM-DD
 * @param {string} purpose 用途标识，如 encounter / order
 * @param {number} index   第几次抽取
 */
export function dailyRandom(dateStr, purpose, index = 0) {
  const rng = mulberry32(hashSeed(`${dateStr}|${purpose}|${index}`));
  return rng();
}

/** 从数组中按确定性随机取一个 */
export function pickDaily(dateStr, purpose, index, arr) {
  return arr[Math.floor(dailyRandom(dateStr, purpose, index) * arr.length) % arr.length];
}
