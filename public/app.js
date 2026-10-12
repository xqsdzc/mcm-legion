/* 麦麦军团 · 前端应用（Vue 3 全局构建，无外部网络依赖） */
const { createApp, ref, computed, onMounted, onUnmounted, nextTick } = Vue;

const DAMAGE_NAMES = ["完好无损", "轻微损伤", "明显破损", "战火蔓延", "濒临崩塌", "完全损毁"];
const BUILD_NAMES = ["夯土奠基", "立起钢骨", "封顶合围", "金拱就位", "香气调试", "盛大开业"];

const NAV_ICONS = {
  legion: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 2.5 4 5.5v6c0 5 3.4 8.6 8 10 4.6-1.4 8-5 8-10v-6l-8-3z"/><path d="M9 11.5l2 2 4-4.5"/></svg>`,
  map: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.8 2.6 4 5.6 4 9s-1.2 6.4-4 9c-2.8-2.6-4-5.6-4-9s1.2-6.4 4-9z"/></svg>`,
  build: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 21h18M5 21V10l7-5 7 5v11"/><path d="M9.5 21v-6h5v6"/></svg>`,
  codex: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17.5H6.5A2.5 2.5 0 0 0 4 22V4.5z"/><path d="M20 19.5V22H6.5"/><path d="M8.5 7h8M8.5 10.5h5"/></svg>`,
  // 成就：勋章 + 绶带
  achv: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="9" r="5.4"/><path d="M12 6.9l.85 1.75 1.9.28-1.38 1.35.33 1.9L12 11.2l-1.7.9.33-1.9-1.38-1.35 1.9-.28L12 6.9z"/><path d="M8.6 13.4 7.1 21l4.9-2.4L16.9 21l-1.5-7.6"/></svg>`,
};

/* 今日行动图标（与底部导航同风格的线条 SVG） */
const ACTION_ICONS = {
  // 签到：日历 + 对勾
  checkin: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="M9 15.2l2.1 2.1 4.4-4.6"/></svg>`,
  // 打卡：定位 pin + 金色拱门
  clockin: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21.2s-6.8-5.4-6.8-10.8a6.8 6.8 0 0 1 13.6 0c0 5.4-6.8 10.8-6.8 10.8z"/><path d="M10.2 13.9v-1.1a1.8 1.8 0 0 1 3.6 0v1.1"/></svg>`,
  // 今日订单：小票
  orders: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3.5h7l4 4V20.5H7V3.5z"/><path d="M14 3.5V8h4"/><path d="M10 12h5M10 15.5h5"/></svg>`,
  // 偶遇：爪印
  encounter: `<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><ellipse cx="12" cy="15.6" rx="4.3" ry="3.5"/><circle cx="6.2" cy="10.2" r="1.7"/><circle cx="9.8" cy="7.2" r="1.7"/><circle cx="14.2" cy="7.2" r="1.7"/><circle cx="17.8" cy="10.2" r="1.7"/></svg>`,
  // 定位
  pin: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-6.5-5.2-6.5-10.3a6.5 6.5 0 0 1 13 0C18.5 15.8 12 21 12 21z"/><circle cx="12" cy="10.5" r="2.3"/></svg>`,
};

createApp({
  setup() {
    /* ---------- 基础状态 ---------- */
    const tab = ref("legion");
    const codexTab = ref("animals");
    const mapIndex = ref(0);
    const modal = ref(null);
    const detail = ref(null);
    const gain = ref(null); // { title, subtitle, items: [{name,count,power,asset,assetAlt,story,extra,order}] }
    const achvQueue = ref([]); // 待展示的「新解锁成就」队列
    const achvShow = ref(null); // { items: [achievement...] } 当前解锁弹窗内容
    const pendingWorld = ref(false); // 首次签到后待展示世界观
    const toast = ref("");
    const showEnding = ref(false);
    let toastTimer = null;
    let endingShown = false; // 终章每会话只弹一次

    const emptyState = () => ({
      date: "", player: null, mcp: { mode: "offline" }, army: { detail: [], byType: {}, total: 0, vulnerable: 0 },
      frontier: null,
      daily: { checkin: false, encounter: false, order: { claimed: false }, dispatch: false,
               clockin: { done: 0, limit: 3 } },
      strongholds: [], empire: { conquered: 0, built: 0, total: 9, done: false }, animalsToday: [],
      achievements: { unlocked: 0, total: 20, items: [] },
    });
    const state = ref(emptyState());
    const codex = ref({ animals: [], stores: [], ruins: [], characters: [], strongholdStories: [], world: {} });
    const stores = ref([]);

    /* ---------- 攻略场景 ---------- */
    const battle = ref({ key: null, sh: null, busy: false, log: [], stage: 0, stageName: "", conquered: false });
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
    // 展示名：麦麦粉带性别（name 为 "男"/"女"）
    const unitLabel = (u) => {
      if (u.type === "fan" && u.name) return `麦麦粉（${u.name}）`;
      return u.name || unitName(u.key);
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

    /** 打开「收获弹窗」：展示获得的物品（立绘/数量/战力/介绍） */
    function showGain(title, subtitle, items) {
      gain.value = { title, subtitle, items };
      modal.value = "gain";
    }

    /** 收集新解锁的成就；若当前无弹层则立即展示（否则在弹层关闭后接排） */
    function queueAchievements(list) {
      if (!list || !list.length) return;
      achvQueue.value.push(...list);
      if (!modal.value) showNextAchv();
    }

    /** 依次展示解锁成就弹窗（一次最多 3 枚）；展示完若还有待弹世界观则弹世界观 */
    function showNextAchv() {
      if (achvQueue.value.length) {
        achvShow.value = { items: achvQueue.value.splice(0, 3) };
        modal.value = "achv";
      } else if (pendingWorld.value) {
        pendingWorld.value = false;
        modal.value = "world";
      } else {
        modal.value = null;
      }
    }

    /** 关闭收获弹窗；接着按队列展示成就/世界观 */
    function closeGain() {
      showNextAchv();
    }

    /* ---------- 数据加载 ---------- */
    async function refresh() {
      const prevDone = state.value.empire.done;
      state.value = await api("/api/state");
      if (!prevDone && state.value.empire.done && !endingShown) {
        endingShown = true;
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
      if (modal.value) {
        if (modal.value === "gain" || modal.value === "achv") showNextAchv();
        else modal.value = null;
        return;
      }
      if (showEnding.value) { showEnding.value = false; }
    }

    onMounted(async () => {
      window.addEventListener("keydown", onKeydown);
      await Promise.all([refresh(), loadCodex()]);
      // 轻量轮询：捕捉跨日与外部变化
      setInterval(refresh, 60000);
      // 首次使用：静默 IP 定位填充默认城市（失败不打扰，用服务端默认城市）
      if (!localStorage.getItem("mcm.city")) {
        try {
          const r = await api("/api/locate", {});
          if (r.city) {
            city.value = r.city;
            localStorage.setItem("mcm.city", r.city);
          }
        } catch {
          /* 定位失败时保持默认城市 */
        }
      }
    });

    onUnmounted(() => window.removeEventListener("keydown", onKeydown));

    /* ---------- 今日行动 ---------- */
    async function doCheckin() {
      try {
        const r = await api("/api/checkin", {});
        await refresh();
        if (r.firstEver) pendingWorld.value = true;
        showGain("签到收获", r.firstEver ? "欢迎加入麦麦军团" : "明天再来", r.items);
        queueAchievements(r.achievements); // 先开收获弹窗再入队：关闭收获后按链展示
      } catch (e) { showToast(e.message); }
    }

    /* ---------- 打卡城市（MCP 仅支持按城市搜索，IP 定位 + 手动切换） ---------- */
    const city = ref(localStorage.getItem("mcm.city") || "");
    const cityInput = ref("");
    const cityPickerOpen = ref(false);
    const locating = ref(false);
    const hotCities = ["北京", "上海", "广州", "深圳", "成都", "杭州", "武汉", "西安", "南京", "苏州", "重庆", "天津", "长沙", "郑州", "青岛", "厦门"];

    async function reloadStores() {
      const q = city.value ? `?city=${encodeURIComponent(city.value)}` : "";
      const r = await api("/api/stores" + q);
      stores.value = r.stores;
    }

    async function openStores() {
      try {
        await refresh();       // 先拉最新状态，保证「今日 x/3」进度准确
        await reloadStores();
        modal.value = "stores";
      } catch (e) { showToast(e.message); }
    }

    async function locateCity() {
      locating.value = true;
      try {
        const r = await api("/api/locate", {});
        if (!r.city) { showToast("定位失败，请手动选择城市"); return; }
        city.value = r.city;
        localStorage.setItem("mcm.city", r.city);
        await reloadStores();
        showToast(`已定位到${r.city}，门店列表已更新`);
      } catch (e) {
        showToast("定位失败，请手动选择城市");
      } finally {
        locating.value = false;
      }
    }

    async function switchCity(c) {
      c = (c || "").trim();
      if (!c) { showToast("请输入城市名"); return; }
      city.value = c;
      localStorage.setItem("mcm.city", c);
      cityInput.value = "";
      cityPickerOpen.value = false;
      try {
        await reloadStores();
      } catch (e) { showToast(e.message); }
    }

    async function doClockin(store) {
      try {
        // 连同当前城市与门店快照一起提交：后端直接使用列表里的门店，
        // 不再按默认城市回查 MCP（否则切换城市后点击门店会「找不到该门店」）
        const r = await api("/api/clockin", {
          storeCode: store.storeCode,
          city: city.value || undefined,
          store,
        });
        await refresh();
        showGain("打卡收获", r.store.storeName, r.items);
        queueAchievements(r.achievements);
      } catch (e) { showToast(e.message); }
    }

    async function doOrders() {
      try {
        const r = await api("/api/orders", {});
        if (!r.gained.length) {
          queueAchievements(r.achievements);
          showToast(r.orderCount ? "订单奖励已领取" : "今天还没有订单，先去享用一餐吧");
        } else {
          await refresh();
          showGain("订单奖励", `共 ${r.orderCount} 笔订单`, r.items);
          queueAchievements(r.achievements);
        }
      } catch (e) { showToast(e.message); }
    }

    async function doEncounter() {
      try {
        const r = await api("/api/encounter", {});
        await refresh();
        await loadCodex();
        showGain("偶遇", "今日限定", r.items);
        queueAchievements(r.achievements);
      } catch (e) { showToast(e.message); }
    }

    /* ---------- 重置进度 ---------- */
    async function doReset() {
      try {
        await api("/api/reset", {});
        modal.value = null;
        pendingWorld.value = false;
        achvQueue.value = [];
        achvShow.value = null;
        endingShown = false;
        showEnding.value = false;
        battle.value.key = null;
        codexTab.value = "animals";
        mapIndex.value = 0;
        await refresh();
        await loadCodex();
        mapIndex.value = state.value.strongholds.findIndex((s) => s.key === state.value.frontier);
        if (mapIndex.value < 0) mapIndex.value = 0;
        showToast("进度已重置，一切从头开始");
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
      battle.value = { key, sh, busy: false, log: [], stage: 0, stageName: "", conquered: false };
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
          battle.value.stageName = st.name;
          const lostText = st.lost.length
            ? st.lost.map((l) => `${unitLabel(l)}×${l.count}`).join("、")
            : "将军与动物无恙";
          pushBattleLog(
            "",
            `第 ${st.stage} 阶段「${st.name}」：${st.desc}损失 ${st.lostPower} 战力（${lostText}）→ 剩余 ${st.remainingPower}`
          );
          await sleep(1150);
        }
        battle.value.conquered = r.conquered;
        if (r.conquered) {
          pushBattleLog("win", `🎉 完全损毁！「${sh.name}」攻略成功，解锁下一个据点与建设任务`);
        } else {
          pushBattleLog("lose", `⚠ 战力不足，被迫撤退。损毁进度已保留（${r.damage}/5），整备后再战`);
        }
        await refresh();
        await loadCodex();
        queueAchievements(r.achievements);
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
        showToast(`派遣成功：消耗 ${cost}，进度「${r.buildName}」——${r.buildDesc}${r.built ? " 🎉 麦麦据点建成！" : ""}`);
        modal.value = null;
        await refresh();
        await loadCodex();
        queueAchievements(r.achievements);
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
        { title: "美食战士", note: "订单奖励", types: ["warrior"] },
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
        name: unitLabel(u),
        power: u.power,
        assetUrl: asset(u.asset || (u.def && u.def.asset)),
        story: story ? story.story : "",
        extra: u.type === "animal"
          ? `${u.def?.name ?? ""} · 小动物只存在于偶遇当天`
          : null,
      };
      modal.value = "unit";
    }

    function showAnimal(a) {
      detail.value = {
        name: a.name,
        power: a.power,
        assetUrl: asset(a.asset),
        story: a.story,
        extra: a.discovered
          ? `${a.species} · 首次偶遇 ${a.firstSeen} · 累计 ${a.seenCount} 次`
          : `${a.species} · 尚未偶遇过它`,
      };
      modal.value = "animal";
    }

    /* ---------- 成就详情 ---------- */
    function showAchvDetail(a) {
      detail.value = {
        name: a.name,
        tier: a.tier,
        badge: a.badge,
        unlocked: a.unlocked,
        unlockedAt: a.unlockedAt,
        desc: a.desc,
        story: a.flavor,
        extra: a.unlocked ? "" : "尚未解锁，继续征战吧",
      };
      modal.value = "achvDetail";
    }

    /* ---------- 杂项 ---------- */
    const conqueredPct = computed(() => (state.value.empire.conquered / state.value.empire.total) * 100);
    const builtPct = computed(() => (state.value.empire.built / state.value.empire.total) * 100);
    const endingText = computed(() => codex.value.world?.ending ?? "");
    const strongholds = computed(() => state.value.strongholds);
    // 今日打卡进度：daily.clockin 可能缺失（旧存档/加载中），兜底 0/3
    const clockinDone = computed(() => state.value.daily?.clockin?.done ?? 0);
    const clockinLimit = computed(() => state.value.daily?.clockin?.limit ?? 3);
    const tabs = [
      { key: "legion", name: "军团", icon: NAV_ICONS.legion },
      { key: "map", name: "地图", icon: NAV_ICONS.map },
      { key: "build", name: "建造", icon: NAV_ICONS.build },
      { key: "codex", name: "图鉴", icon: NAV_ICONS.codex },
      { key: "achv", name: "成就", icon: NAV_ICONS.achv },
    ];
    const codexTabs = [
      { key: "animals", name: "动物图鉴" },
      { key: "stores", name: "打卡地" },
      { key: "ruins", name: "据点图鉴" },
    ];

    return {
      tab, tabs, codexTabs, codexTab, mapIndex, modal, detail, gain, toast, showEnding,
      achvQueue, achvShow,
      state, codex, stores, currentSh, shStatus, shAsset, damageStages, shiftStronghold,
      enterBattle, quitBattle, battle, battleUnits, battleArmyPower, battleImage, canAttack, startAttack, battleLogEl,
      buildSites, buildSteps, buildStepName, openDispatch, doDispatch, chooseGeneral, myGenerals,
      unitGroups, showUnit, showAnimal, doCheckin, openStores, doClockin, doOrders, doEncounter, doReset,
      city, cityInput, cityPickerOpen, locating, hotCities, locateCity, switchCity,
      fmtNum, asset, avatarUrl, unitName, unitLabel, closeGain, showNextAchv, showAchvDetail, pendingWorld,
      ACTION_ICONS, conqueredPct, builtPct, endingText, strongholds, clockinDone, clockinLimit,
    };
  },
}).mount("#app");
