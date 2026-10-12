/* 麦麦军团 · 前端应用（Vue 3 全局构建，无外部网络依赖） */
const { createApp, ref, computed, onMounted, onUnmounted, nextTick } = Vue;

const DAMAGE_NAMES = ["完好无损", "轻微损伤", "明显破损", "战火蔓延", "濒临崩塌", "完全损毁"];
const BUILD_NAMES = ["夯土奠基", "立起钢骨", "封顶合围", "金拱就位", "香气调试", "盛大开业"];

const NAV_ICONS = {
  legion: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 2.5 4 5.5v6c0 5 3.4 8.6 8 10 4.6-1.4 8-5 8-10v-6l-8-3z"/><path d="M9 11.5l2 2 4-4.5"/></svg>`,
  map: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.8 2.6 4 5.6 4 9s-1.2 6.4-4 9c-2.8-2.6-4-5.6-4-9s1.2-6.4 4-9z"/></svg>`,
  build: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 21h18M5 21V10l7-5 7 5v11"/><path d="M9.5 21v-6h5v6"/></svg>`,
  codex: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17.5H6.5A2.5 2.5 0 0 0 4 22V4.5z"/><path d="M20 19.5V22H6.5"/><path d="M8.5 7h8M8.5 10.5h5"/></svg>`,
};

createApp({
  setup() {
    /* ---------- 基础状态 ---------- */
    const tab = ref("legion");
    const codexTab = ref("animals");
    const mapIndex = ref(0);
    const modal = ref(null);
    const detail = ref(null);
    const toast = ref("");
    const showEnding = ref(false);
    let toastTimer = null;

    const emptyState = () => ({
      date: "", player: null, mcp: { mode: "offline" }, army: { detail: [], byType: {}, total: 0, vulnerable: 0 },
      frontier: null, daily: { checkin: false, encounter: false, order: { claimed: false }, dispatch: false },
      strongholds: [], empire: { conquered: 0, built: 0, total: 9, done: false }, animalsToday: [],
    });
    const state = ref(emptyState());
    const codex = ref({ animals: [], stores: [], ruins: [], characters: [], strongholdStories: [], world: {} });
    const stores = ref([]);

    /* ---------- 攻略场景 ---------- */
    const battle = ref({ key: null, sh: null, busy: false, log: [], stage: 0, stageName: "" });
    const battleUnits = ref([]);
    const battleArmyPower = ref(0);
    const battleLogEl = ref(null);

    /** 推送战斗日志并自动滚动到底部 */
    function pushBattleLog(cls, text) {
      battle.value.log.push({ cls, text });
      nextTick(() => {
        const el = battleLogEl.value;
        if (el) el.scrollTop = el.scrollHeight;
      });
    }

    /* ---------- 工具 ---------- */
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const fmtNum = (n) => (n ?? 0).toLocaleString("zh-CN");
    const asset = (p) => (p ? `/assets/${p}` : "");

    // 出战编制小图标：使用 assets/avatars/ 头部特写（麦麦粉男女交替）
    const avatarUrl = (u, i) => {
      let p = u.asset || "";
      if (u.assetAlt && i % 2 === 1) p = u.assetAlt;
      return p ? `/assets/avatars/${p.split("/").pop()}` : "";
    };
    const unitName = (key) => {
      const hit = codex.value.characters.find((c) => c.key === key)
        ?? codex.value.animals.find((a) => a.key === key);
      return hit ? hit.name : key;
    };

    async function api(path, body) {
      const res = await fetch(path, {
        method: body ? "POST" : "GET",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `请求失败 ${res.status}`);
      return data;
    }

    function showToast(text, ms = 2600) {
      toast.value = text;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => (toast.value = ""), ms);
    }

    /* ---------- 数据加载 ---------- */
    async function refresh() {
      const prevDone = state.value.empire.done;
      state.value = await api("/api/state");
      if (!prevDone && state.value.empire.done) {
        showEnding.value = true;
      }
      // 地图索引跟随攻略前线
      const idx = state.value.strongholds.findIndex((s) => s.key === state.value.frontier);
      if (idx >= 0) mapIndex.value = idx;
    }

    async function loadCodex() {
      codex.value = await api("/api/codex");
    }

    /* ---------- Esc 关闭弹层 ---------- */
    function onKeydown(e) {
      if (e.key !== "Escape") return;
      if (modal.value) { modal.value = null; return; }
      if (showEnding.value) { showEnding.value = false; }
    }

    onMounted(async () => {
      window.addEventListener("keydown", onKeydown);
      await Promise.all([refresh(), loadCodex()]);
      // 轻量轮询：捕捉跨日与外部变化
      setInterval(refresh, 60000);
    });

    onUnmounted(() => window.removeEventListener("keydown", onKeydown));

    /* ---------- 今日行动 ---------- */
    async function doCheckin() {
      try {
        const r = await api("/api/checkin", {});
        showToast(`签到成功：麦麦粉 ×${r.gained.count}`);
        await refresh();
      } catch (e) { showToast(e.message); }
    }

    async function openStores() {
      try {
        const r = await api("/api/stores");
        stores.value = r.stores;
        modal.value = "stores";
      } catch (e) { showToast(e.message); }
    }

    async function doClockin(storeCode) {
      try {
        const r = await api("/api/clockin", { storeCode });
        const g = r.gotGeneral ? `麦麦将军「${r.store.storeName}」×1 + ` : "";
        showToast(`打卡成功：${g}麦麦军 ×${r.gained.juns}`);
        modal.value = null;
        await refresh();
      } catch (e) { showToast(e.message); }
    }

    async function doOrders() {
      try {
        const r = await api("/api/orders", {});
        if (!r.gained.length) {
          showToast(r.orderCount ? "今日订单奖励已领取" : "今天还没有订单，先去享用一餐吧");
        } else {
          const names = r.gained.map((g) => unitName(g.warriorKey)).join("、");
          showToast(`今日 ${r.orderCount} 单订单 → 美食战士：${names}`);
        }
        await refresh();
      } catch (e) { showToast(e.message); }
    }

    async function doEncounter() {
      try {
        const r = await api("/api/encounter", {});
        showToast(`偶遇成功：${unitName(r.gained.key)}（仅今天有效）`);
        await refresh();
        await loadCodex();
      } catch (e) { showToast(e.message); }
    }

    /* ---------- 攻略 ---------- */
    const currentSh = computed(() => state.value.strongholds[mapIndex.value] ?? null);

    const shStatus = computed(() => {
      const s = currentSh.value;
      if (!s) return { text: "", cls: "" };
      if (s.built) return { text: "麦麦据点", cls: "done" };
      if (s.conquered) return { text: "已攻略", cls: "done" };
      if (s.damage > 0) return { text: s.damageName, cls: "damaged" };
      if (s.frontier) return { text: "可攻略", cls: "attack" };
      return { text: "未解锁", cls: "locked" };
    });

    function shAsset(s) {
      const stage = s.conquered ? 5 : s.damage;
      return `/assets/strongholds/${s.key}_${stage}.png`;
    }

    function damageStages(s) {
      const ruin = codex.value.ruins.find((r) => r.key === s.key);
      if (ruin) return ruin.stages;
      return DAMAGE_NAMES.map((name, stage) => ({ stage, name, reached: stage <= s.damage }));
    }

    function shiftStronghold(dir) {
      const next = mapIndex.value + dir;
      if (next >= 0 && next < state.value.strongholds.length) mapIndex.value = next;
    }

    function enterBattle(key) {
      const sh = state.value.strongholds.find((s) => s.key === key);
      if (!sh) return;
      battle.value = { key, sh, busy: false, log: [], stage: 0, stageName: "" };
      // 出战编制快照
      battleUnits.value = state.value.army.detail.map((d) => ({ ...d }));
      battleArmyPower.value = state.value.army.total;
    }

    function quitBattle() {
      battle.value.key = null;
      refresh();
    }

    const canAttack = computed(
      () => battle.value.sh && battleArmyPower.value > battle.value.sh.power && !battle.value.busy
    );

    const battleImage = computed(() => {
      if (!battle.value.sh) return "";
      return `/assets/strongholds/${battle.value.sh.key}_${battle.value.stage}.png`;
    });

    async function startAttack() {
      const sh = battle.value.sh;
      if (!sh || battle.value.busy) return;
      battle.value.busy = true;
      battle.value.log = [];
      try {
        const r = await api("/api/attack", { key: sh.key });
        for (const st of r.stages) {
          // 应用战损到本地编制
          for (const lost of st.lost) {
            const u = battleUnits.value.find((x) => x.key === lost.key && x.name === (lost.name || ""));
            if (u) u.count = Math.max(0, u.count - lost.count);
          }
          battleArmyPower.value = st.remainingPower;
          battle.value.stage = st.stage;
          battle.value.stageName = DAMAGE_NAMES[st.stage];
          const lostText = st.lost.length
            ? st.lost.map((l) => `${l.name || unitName(l.key)}×${l.count}`).join("、")
            : "将军与动物无恙";
          pushBattleLog(
            "",
            `第 ${st.stage} 阶段「${DAMAGE_NAMES[st.stage]}」：损失 ${st.lostPower} 战力（${lostText}）→ 剩余 ${st.remainingPower}`
          );
          await sleep(1150);
        }
        if (r.conquered) {
          pushBattleLog("win", `🎉 完全损毁！「${sh.name}」攻略成功，解锁下一个据点与建设任务`);
        } else {
          pushBattleLog("lose", `⚠ 战力不足，被迫撤退。损毁进度已保留（${r.damage}/5），整备后再战`);
        }
        await refresh();
        await loadCodex();
      } catch (e) {
        showToast(e.message);
      } finally {
        battle.value.busy = false;
      }
    }

    /* ---------- 建设 ---------- */
    const buildSites = computed(() => state.value.strongholds.filter((s) => s.conquered));
    const buildSteps = BUILD_NAMES.map((name) => ({ name }));
    const buildStepName = (i) => BUILD_NAMES[Math.max(0, Math.min(5, i))];
    let pendingBuildKey = null;

    function openDispatch(s) {
      pendingBuildKey = s.key;
      if (s.buildStep < 0) {
        // 开启建设：需要选择将军
        modal.value = "general";
      } else {
        doDispatch(s.key, "");
      }
    }

    async function doDispatch(key, generalName) {
      const target = key || pendingBuildKey;
      if (!target) return;
      try {
        const r = await api("/api/build", { key: target, generalName });
        const cost = r.consumed.type === "general" ? `麦麦将军「${r.consumed.name}」` : "麦麦军 ×1";
        showToast(`派遣成功：消耗 ${cost}，进度「${r.buildName}」${r.built ? " 🎉 麦麦据点建成！" : ""}`);
        modal.value = null;
        await refresh();
        await loadCodex();
      } catch (e) { showToast(e.message); }
    }

    function chooseGeneral(generalName) {
      doDispatch(pendingBuildKey, generalName);
    }

    const myGenerals = computed(() =>
      state.value.army.detail.filter((d) => d.type === "general")
    );

    /* ---------- 军团卡片 ---------- */
    const unitGroups = computed(() => {
      const groups = [
        { title: "麦麦军团", note: "签到 · 打卡收集", types: ["fan", "jun", "general"] },
        { title: "美食战士", note: "今日订单奖励", types: ["warrior"] },
        { title: "今日偶遇动物", note: "仅今天有效", types: ["animal"] },
      ];
      return groups.map((g) => ({
        title: g.title,
        note: g.note,
        items: state.value.army.detail.filter((d) => g.types.includes(d.type)),
      }));
    });

    /* ---------- 详情 ---------- */
    function showUnit(u) {
      // 角色查 characters；动物（今日偶遇）回落到 animals 图鉴取故事
      const story = codex.value.characters.find((c) => c.key === u.key)
        || (u.type === "animal" ? codex.value.animals.find((c) => c.key === u.key) : null);
      detail.value = {
        name: u.name || (story ? story.name : u.key),
        power: u.power,
        assetUrl: asset(u.def ? u.def.asset : u.asset),
        story: story ? story.story : "",
        extra: u.type === "animal" ? "小动物只存在于偶遇当天" : null,
      };
      modal.value = "unit";
    }

    function showAnimal(a) {
      detail.value = {
        name: a.name,
        power: a.power,
        assetUrl: asset(a.asset),
        story: a.story,
        extra: a.discovered ? `首次偶遇 ${a.firstSeen} · 累计 ${a.seenCount} 次` : "尚未偶遇过它",
      };
      modal.value = "animal";
    }

    /* ---------- 杂项 ---------- */
    const empirePct = computed(() => (state.value.empire.built / state.value.empire.total) * 100);
    const endingText = computed(() => codex.value.world?.ending ?? "");
    const strongholds = computed(() => state.value.strongholds);
    const tabs = [
      { key: "legion", name: "军团", icon: NAV_ICONS.legion },
      { key: "map", name: "地图", icon: NAV_ICONS.map },
      { key: "build", name: "建造", icon: NAV_ICONS.build },
      { key: "codex", name: "图鉴", icon: NAV_ICONS.codex },
    ];
    const codexTabs = [
      { key: "animals", name: "动物图鉴" },
      { key: "stores", name: "打卡地" },
      { key: "ruins", name: "损毁图鉴" },
    ];

    return {
      tab, tabs, codexTabs, codexTab, mapIndex, modal, detail, toast, showEnding,
      state, codex, stores, currentSh, shStatus, shAsset, damageStages, shiftStronghold,
      enterBattle, quitBattle, battle, battleUnits, battleArmyPower, battleImage, canAttack, startAttack, battleLogEl,
      buildSites, buildSteps, buildStepName, openDispatch, doDispatch, chooseGeneral, myGenerals,
      unitGroups, showUnit, showAnimal, doCheckin, openStores, doClockin, doOrders, doEncounter,
      fmtNum, asset, avatarUrl, unitName, empirePct, endingText, strongholds,
    };
  },
}).mount("#app");
