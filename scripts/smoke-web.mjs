#!/usr/bin/env node
/**
 * 麦麦军团 · Web 界面冒烟测试（需要 playwright）
 *
 *   npm i -D playwright && npx playwright install chromium   # 首次
 *   node server.mjs &                                        # 先启动服务
 *   node scripts/smoke-web.mjs
 *
 * 验证：页面加载、四个页签渲染、每日行动交互、打卡弹层、
 *       进入攻略与五阶段战斗动画、截图存档到 docs/screenshots/。
 */
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SHOTS = join(ROOT, "docs", "screenshots");
const BASE = process.env.BASE || "http://localhost:3210";
mkdirSync(SHOTS, { recursive: true });

/** 解析 playwright：优先 playwright，其次 playwright-core（需 CHROMIUM_PATH 指定浏览器） */
async function loadChromium() {
  const opts = {};
  if (process.env.CHROMIUM_PATH) opts.executablePath = process.env.CHROMIUM_PATH;
  let mod;
  try {
    mod = await import("playwright");
  } catch {
    try {
      mod = await import("playwright-core");
    } catch {
      const p = process.env.PLAYWRIGHT_PATH;
      if (!p) throw new Error("未找到 playwright，请先 npm i -D playwright 或设置 PLAYWRIGHT_PATH");
      mod = await import(pathToFileURL(p).href);
    }
  }
  const chromium = mod.chromium ?? mod.default?.chromium;
  return { chromium, opts };
}

const { chromium, opts: browserOpts } = await loadChromium();
const errors = [];
let passed = 0;
let failed = 0;
const ok = (cond, name) => {
  if (cond) { passed++; console.log(`  ✔ ${name}`); }
  else { failed++; console.log(`  ✘ ${name}`); }
};

const browser = await chromium.launch(browserOpts);
const page = await browser.newPage({ viewport: { width: 430, height: 880 } });
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  // 忽略接口业务错误（如“今日已打卡”）触发的资源加载失败，只关心 JS 运行时错误
  if (m.type() === "error" && !m.text().includes("Failed to load resource")) {
    errors.push(`console: ${m.text()}`);
  }
});

/** 关闭当前所有链式弹层（收获 → 成就解锁 → 世界观可能连弹） */
async function closeAllModals(page) {
  for (let i = 0; i < 6; i++) {
    if (!(await page.locator(".modal-layer").count())) break;
    const btn = page.locator(".modal-layer .btn-primary").last();
    if (await btn.count()) await btn.click();
    else {
      const ghost = page.locator(".modal-layer .btn-ghost").last();
      if (await ghost.count()) await ghost.click();
      else break;
    }
    await page.waitForTimeout(250);
  }
}

console.log(`\n打开 ${BASE} ...`);
await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForSelector(".hud-power .value", { timeout: 8000 });

// 顶栏战力数字
const power = await page.textContent(".hud-power .value");
ok(/[\d,]+/.test(power), `顶栏战力渲染：${power}`);

// 军团页
await page.screenshot({ path: join(SHOTS, "01-legion.png") });
ok(await page.locator(".action-grid .action-btn").count() === 4, "今日行动四个按钮");
ok(await page.locator(".empire-panel").count() === 1, "帝国进度面板");

// 打卡弹层
await page.locator(".action-grid .action-btn").nth(1).click();
await page.waitForSelector(".modal-layer .store-item", { timeout: 5000 });
ok(await page.locator(".store-item").count() > 0, "打卡门店列表");
await page.screenshot({ path: join(SHOTS, "02-clockin.png") });
// 若今日已全部打卡则关闭，否则打卡第一家
const clockinBtn = page.locator(".store-item").first();
await clockinBtn.click();
await page.waitForTimeout(800);
// 打卡成功会依次弹出「收获 → 成就解锁（首次）」等链式弹层；失败（如今日已打卡）则手动关闭
await closeAllModals(page);

// 地图页
await page.locator(".hud-nav button").nth(1).click();
await page.waitForSelector(".stronghold-panel");
const shName = await page.textContent(".sh-name");
ok(Boolean(shName), `据点信息渲染：${shName}`);
await page.screenshot({ path: join(SHOTS, "03-map.png") });

// 进入攻略（若可攻略）
const enterBtn = page.locator(".sh-actions .btn-primary");
if (await enterBtn.count()) {
  const disabled = await enterBtn.isDisabled();
  ok(true, `攻略按钮状态：${disabled ? "战力不足" : "可进入"}`);
  if (!disabled) {
    await enterBtn.click();
    await page.waitForSelector(".battle-layer", { timeout: 5000 });
    ok(await page.locator(".battle-sh-art img").count() === 1, "攻略场景据点图像");
    ok(await page.locator(".bu-row").count() > 0, "攻略场景军团编制");
    await page.screenshot({ path: join(SHOTS, "04-battle.png") });

    const attackBtn = page.locator(".btn-attack");
    if (await attackBtn.isEnabled()) {
      await attackBtn.click();
      // 等待战斗动画结束（最多 12 秒）
      await page.waitForFunction(
        () => document.querySelector(".btn-attack") && !document.querySelector(".btn-attack").disabled,
        { timeout: 15000 }
      ).catch(() => {});
      await page.waitForTimeout(800);
      const logCount = await page.locator(".battle-log > div").count();
      ok(logCount > 0, `战斗日志 ${logCount} 条`);
      await page.screenshot({ path: join(SHOTS, "05-battle-result.png") });
      // 战斗可能解锁成就（弹层压在攻略场景之上），先关掉再撤退
      await closeAllModals(page);
    }
    // 撤退
    await page.locator(".battle-top .btn-ghost").click();
    await page.waitForTimeout(400);
  }
}

// 建造页
await page.locator(".hud-nav button").nth(2).click();
await page.waitForTimeout(500);
await page.screenshot({ path: join(SHOTS, "06-build.png") });

// 图鉴页
await page.locator(".hud-nav button").nth(3).click();
await page.waitForTimeout(500);
ok(await page.locator(".unit-card").count() >= 10, "动物图鉴 10 格");
await page.screenshot({ path: join(SHOTS, "07-codex-animals.png") });

// 图鉴-打卡地
await page.locator(".codex-tabs button").nth(1).click();
await page.waitForTimeout(300);
await page.screenshot({ path: join(SHOTS, "08-codex-stores.png") });

// 图鉴-损毁
await page.locator(".codex-tabs button").nth(2).click();
await page.waitForTimeout(300);
await page.screenshot({ path: join(SHOTS, "09-codex-ruins.png") });

// 成就页
await page.locator(".hud-nav button").nth(4).click();
await page.waitForTimeout(500);
ok(await page.locator(".achv-cell").count() === 20, "成就殿堂 20 枚徽章");
const unlockedCells = await page.locator(".achv-cell.on").count();
ok(unlockedCells >= 1, `已解锁徽章 ${unlockedCells} 枚（含打卡解锁）`);
await page.locator(".achv-cell.on").first().click();
await page.waitForSelector(".achv-detail-modal", { timeout: 5000 });
ok(await page.locator(".achv-detail-modal .achv-badge svg").count() === 1, "成就详情展示徽章");
await closeAllModals(page);
await page.screenshot({ path: join(SHOTS, "10-achievements.png") });

// 无 JS 报错
ok(errors.length === 0, `无前端报错${errors.length ? "：" + errors.slice(0, 3).join(" | ") : ""}`);

await browser.close();
console.log(`\n冒烟测试：${passed} 通过，${failed} 失败；截图 -> docs/screenshots/\n`);
process.exit(failed > 0 ? 1 : 0);
