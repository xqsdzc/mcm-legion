# workbuddy.md — 麦麦军团开发过程记录

本文档记录「麦麦军团」从需求到上线的完整开发过程，说明本项目如何借助 WorkBuddy 的自动化能力完成。按时间线组织，可作为复现参考。

---

## 一、需求阶段

用户提出参赛创意：基于麦当劳 MCP 能力做一个"收集战力 → 攻略竞争对手据点 → 重建麦麦据点 → 建立麦麦帝国"的游戏，要求明确的收集机制（签到/打卡/订单/偶遇）、5 阶段攻略规则、6 步建设任务、图鉴系统，并上传到 GitHub 参加 [mcd-developer-innovation-challenge](https://github.com/M-China/mcd-developer-innovation-challenge)。

WorkBuddy 首先完成了三件事：

1. **读取挑战赛要求**：抓取 GitHub 仓库 README，确认仓库必须包含 README.md、SKILL.md、CONTEST_DECLARATION.md（官方声明原文）等文件清单。
2. **实测 MCP 能力**：通过已配置的 mcd-mcp 连接器实际调用 `query-nearby-stores` 与 `order-list`，确认返回结构（门店含 `storeCode`/`storeName`，订单含 `orderId`/`createTime`），确定以 `searchType=1`（收藏优先）+ `searchType=2`（城市搜索）两级降级策略获取门店。
3. **盘点美术资产**：`raw/` 目录 86 张约 3MB 的 PNG，先分类（据点 6 阶段 ×9、角色、动物），再决定压缩管线。

---

## 二、资产压缩管线（Python + Pillow）

原始资产 270MB，直接入库会让仓库和首屏加载都不可接受。编写 `scripts/build-assets.py`：

1. 按 alpha 通道 bbox 裁剪（去掉透明留白）；
2. LANCZOS 缩放到目标尺寸（据点 640px、角色 512px）；
3. FASTOCTREE 256 色量化转 PNG8。

**结果：86 张 270MB → 82 个文件 8.27MB**，视觉无损、秒级加载。

**二轮压缩**（参赛前减重）：据点/建设 640→384px、角色/动物 512→320px，主资产降至 3.6MB；新增 `scripts/build-avatars.py` 从立绘切割 128px 头部特写头像 22 张（196KB）；`scripts/compress-docs.py` 将 UI 风格图与实机截图转 JPEG（再省 2.9MB）。

---

## 三、后端实现（Node.js，零运行时依赖）

技术选型：

- **存储**：Node.js ≥ 22.5 内置 `node:sqlite`（`DatabaseSync`）+ WAL，不引入任何驱动，`clone` 即可跑；
- **MCP 客户端**：`@modelcontextprotocol/sdk` 动态 `import()`，未安装时自动降级为离线演示模式（MOCK 门店 + 按日期确定性生成的演示订单），保证无 Token 也能完整体验；
- **服务器**：单文件 `server.mjs`，~20 个 REST 路由 + 静态服务 + 极简 `.env` 解析，端口 3210。

核心模块：

| 文件 | 职责 |
| --- | --- |
| `src/game/config.js` | 全部数值（战力曲线、战损率、每日限制、MOCK 门店） |
| `src/game/story.js` | 全部剧情文案（11 角色列传、10 动物故事、9 据点志异） |
| `src/game/rng.js` | mulberry32 + FNV hash 确定性随机（订单战士），以及 `crypto.randomInt` 真随机（偶遇动物、麦麦粉性别） |
| `src/game/engine.js` | 游戏引擎（约 780 行，所有规则在此实现，含成就统计与判定） |
| `src/game/achievements.js` | 20 枚成就定义与徽章 SVG |
| `src/store/LocalSqliteStore.js` | 存储层，9 张表全部读写 |
| `src/mcp/mcdApi.js` | MCP 客户端（两级门店降级 + 今日订单过滤） |

### 踩坑记录（都已修复并回归验证）

1. **UTC 时间坑**：`toISOString()` 返回 UTC 日期，东八区傍晚后被算成"明天"，导致刚领取的偶遇动物立刻被跨日清理。修复：统一改用本地时间字符串 `nowLocalStr()`。
2. **战损超标**：整数单位整体消耗导致 30% 目标实际扣了 63%。修复："就近逼近"算法——每消耗一个单位判断是否让总损失更接近目标，并保证至少损失最弱 1 个单位。
3. **续攻重打**：攻略总是从第一阶段重新开始，`damage` 进度无意义。修复：从当前阶段续攻（`stagesToDo = 5 - damage`）。
4. **难度曲线**：最初 9 天即可通关，后五据点形同虚设。修复随机种子口径后模拟得 13 天通关，据点 9 战力 2500 成为有挑战的终局目标。
5. **偶遇动物重复（两轮）**：`units` 主键是 `(type, key, name)`，只要出现一行 `name` 不同的同 key 行，同一只动物就会被渲染成两张卡片。第一次只治了「写入端」（写入前清空当天动物行 `replaceAnimalUnit` + 启动归一化 `normalizeAnimals`），漏掉了**产出脏数据的源头**：`army()` 把动物的**展示名**（专属名，如「夜巡」）放在了 `name` 上，而 `attack()` 用 `type|key|name` 组工作副本并原样 `setUnitCount` 写回，upsert 就会新增一条 `name=专属名` 的行——动物免疫战损，旧的 `name=''` 行不会被删，**只要攻略一次据点就必然复制成两只**。修复：`army()` 详情节新增 `storeName`（真实存储名），战斗工作副本与写回一律用 `storeName`（动物的 `storeName` 恒为 `''`）；同时把 `normalizeAnimals()` 挂进 `rollover()`，让存有脏数据的实例在下次操作/刷新时自动收敛。教训：展示名与存储身份必须分开，凡是拿展示对象回写数据库的地方都要用存储字段。
6. **跨城市打卡失败**：打卡只提交 `storeCode`，后端却用默认城市回查 MCP，切换城市后点击该城市门店必然报「没有找到该门店」。修复：前端连同城市与门店快照一起提交，后端直接使用列表里的门店。

### 质量保障

- `scripts/checkgame.mjs`：104 项逻辑自检（每日限制/打卡规则/订单去重/五阶段续攻/建设消耗/跨日清理/动物去重自愈/攻略写回不复制动物/成就系统/13 天通关曲线模拟），全部通过；
- `scripts/smoke-web.mjs`：Playwright 冒烟测试 14 项 + 实机截图存档 `docs/screenshots/`。

---

## 四、前端实现（Vue 3 单文件 SPA）

- 使用 Vue 3 全局构建本地化（`public/vendor/vue.global.prod.js`），无外部网络依赖；
- 视觉风格：经 ImageGen 生成三套候选（全息指挥地图/暖阳餐厅/童话绘本）后，用户选定**方案一：全息指挥地图**——深空蓝底 `#040b18` + 青色 `#4ddbff` HUD + 扫描线 + 面板四角括线；
- 五大页签：军团 / 地图 / 建造 / 图鉴 / 成就；地图页左侧军团卡片+战力、右侧据点图像+名称战力，左右箭头切换 9 个据点；
- 攻略动画按 5 阶段逐段推进（每阶段约 1.15s），战斗日志带 `nextTick` 自动滚动。

踩坑：Vue 3 模板 `ref` 名必须与 `setup()` 返回的变量名一致才能自动滚动（曾因 `battleLog` vs `battleLogEl` 不一致导致日志不滚动）。

截图复查发现的 Bug：攻略页出战编制图标全部不显示——`engine.army()` 的 detail 只有 `def` 对象没有顶层 `asset` 字段，而模板用 `asset(u.asset)` 得到空 `src`（军团页用 `u.def.asset` 所以没暴露）。修复：detail 补 `asset`/`assetAlt` 字段，并配套生成 128px 头像资产（麦麦粉男女交替）。

---

## 五、文档与参赛材料

| 文件 | 内容 |
| --- | --- |
| `README.md` | 项目主文档（玩法、快速开始、目录结构、MCP 集成） |
| `SKILL.md` | Skill 说明（能力描述、使用方式） |
| `CONTEST_DECLARATION.md` | 挑战赛官方声明原文（未改动） |
| `MCP_INTEGRATION.md` | MCP 工具对接说明 |
| `docs/剧情设定集.md` | 由 `story.js` 自动生成的完整剧情（脚本：`gen-story-doc.mjs`） |
| `docs/游戏玩法设计.md` | 玩法规则文档 |
| `docs/数据存储方案.md` | 存储选型、表设计、迁云路径 |

---

## 六、当前状态与后续

- 服务运行于 `http://localhost:3210`（后台任务，端口 3210）；
- 数据文件 `data/mcm-legion.db` 已 gitignore（可用 `MCD_DB=data/test.db` 指定独立存档）；
- 代码已推送至 GitHub：`xqsdzc/mcm-legion`（`master` 分支）。参赛前提是仓库设为 **Public**，需要在 GitHub 仓库 Settings 中确认。
