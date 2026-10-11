#!/usr/bin/env node
/**
 * 由 src/game/story.js 生成 docs/剧情设定集.md（保持文档与游戏内文案一致）
 *   node scripts/gen-story-doc.mjs
 */
import { CHARACTERS, ANIMALS, STRONGHOLDS, DAMAGE, BUILD, WORLD } from "../src/game/story.js";
import { UNITS, ANIMALS as ANIMAL_CFG, STRONGHOLDS as SH_CFG } from "../src/game/config.js";
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "docs", "剧情设定集.md");

const L = [];
L.push("# 麦麦军团 · 剧情设定集", "");
L.push("> 本文档由 `src/game/story.js` 自动生成（`npm run gen:story`），游戏内卡片详情与本文档内容一致。", "");
L.push("## 世界观", "", WORLD.intro, "");

L.push("## 麦麦军团全员列传", "");
L.push("> 写作风格：魔幻现实主义。战力数值见 `src/game/config.js`。", "");
const order = [
  "fan", "jun", "general",
  "warrior_fries", "warrior_spicychicken", "warrior_cola", "warrior_mcflurry",
  "warrior_muffin", "warrior_coffee", "warrior_bigmac", "warrior_arch",
];
for (const key of order) {
  const c = CHARACTERS[key];
  const cfg = UNITS[key];
  const p = cfg ? `（战力 ${cfg.power}）` : "";
  L.push(`### ${c.name}${p}`, "", c.story, "");
}

L.push("## 十只偶遇动物", "");
L.push("> 写作风格：温馨治愈。小动物只存在于偶遇当天，图鉴永久记录。", "");
for (const [key, a] of Object.entries(ANIMALS)) {
  L.push(`### ${a.name}（战力 ${ANIMAL_CFG[key].power}）`, "", a.story, "");
}

L.push("## 九座攻略据点志异", "");
L.push("> 写作风格：魔幻现实主义。按攻略顺序排列。", "");
for (const sh of SH_CFG) {
  const s = STRONGHOLDS[sh.key];
  L.push(`### ${s.name}（据点战力 ${sh.power}）`, "", s.story, "");
}

L.push("## 据点损毁六阶段", "");
DAMAGE.forEach((d, i) => L.push(`${i}. **${d.name}** — ${d.desc}`));
L.push("");

L.push("## 麦麦据点建设六阶段", "");
BUILD.forEach((b, i) => L.push(`${i}. **${b.name}** — ${b.desc}`));
L.push("");

L.push("## 终章：麦麦帝国", "", WORLD.ending, "");
writeFileSync(OUT, L.join("\n"));
console.log(`已生成 ${OUT}（${L.length} 行）`);
