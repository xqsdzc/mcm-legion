---
name: mcm-legion
description: 麦麦军团——基于麦当劳中国 MCP 的收集×攻略×建设游戏。当用户想玩麦麦军团、查看军团战力、签到打卡、攻略据点、派遣建设或查看图鉴时使用。支持 Web（node server.mjs）与命令行（node src/cli.mjs）两种方式。
---

# 麦麦军团 MCM Legion

把麦当劳 MCP 真实数据（附近门店、当日订单）变成收集×攻略×建设游戏进度。
用户数据存本地 SQLite（`data/mcm-legion.db`），Token 走 `.env` 的 `MCD_MCP_TOKEN`（无 Token 自动进入演示模式，全流程可玩）。

## 启动

```bash
# Web 版（推荐，全息 UI）
node server.mjs            # → http://localhost:3210

# 命令行版
node src/cli.mjs demo      # 非交互演示
node src/cli.mjs state     # 查看状态
```

工作目录：本 SKILL.md 所在的项目根目录。

## 常用命令（CLI）

| 命令 | 作用 |
|---|---|
| `node src/cli.mjs state` | 军团战力、各单位、据点进度、今日行动状态 |
| `node src/cli.mjs checkin` | 签到（麦麦粉 ×1） |
| `node src/cli.mjs stores` | 打卡候选门店列表（MCP 或演示数据） |
| `node src/cli.mjs clockin <storeCode>` | 打卡（将军+麦麦军，同店一天一次，每天最多 3 次） |
| `node src/cli.mjs orders` | 今日订单奖励（每单 1 名随机美食战士） |
| `node src/cli.mjs encounter` | 偶遇小动物（仅当天有效） |
| `node src/cli.mjs attack <key>` | 攻略据点（5 阶段，每阶段损 30%，将军/动物免疫） |
| `node src/cli.mjs build <key> [将军名]` | 派遣建设（首遣耗将军任店长，后续耗麦麦军） |
| `node src/cli.mjs codex` | 图鉴（动物/打卡地/据点场景） |
| `node src/cli.mjs battles` | 战报历史 |

据点 key 顺序：`cheap`(县城街边底商) → `chicken` → `tea` → `coffee` → `store` → `cburger` → `burger` → `pizza` → `grandpa`(独栋快餐店)。
只有攻略前线据点可攻打；战力需**高于**据点战力才能开战，每阶段损失后战力**不低于**据点战力才能继续。

## REST API（Web 版）

```
GET  /api/state    完整状态（战力/单位/据点/每日行动/帝国进度）
GET  /api/codex    图鉴（含全部剧情文案）
GET  /api/battles  战报
GET  /api/stores   打卡候选门店
POST /api/checkin         POST /api/clockin {storeCode}
POST /api/orders          POST /api/encounter
POST /api/attack {key}    POST /api/build {key, generalName?}
POST /api/reset           （调试）重置存档
```

## 协助用户时的要点

1. **先查状态再行动**：`node src/cli.mjs state` 或 `GET /api/state`，根据战力与今日行动剩余情况给建议。
2. **规则提醒**：同店打卡一天一次，每天最多打卡 3 次；偶遇/签到/派遣各一天一次；动物仅当天有效；将军战斗免疫但建设开启时会被消耗（消耗后可再次打卡获得）。
3. **攻略建议**：战力需 > 据点战力才能开战，且每阶段损失 30% 后仍需 ≥ 据点战力——约需 6 倍据点战力才能一次攻完，否则会中途撤退（进度保留）。优先打卡新门店攒将军、用今日订单养战士。
4. **建设**：开启建设要指定将军名（`node src/cli.mjs build <key> <将军名>`），将军来自打卡门店名。
5. **调试**：`npm run check:game`（104 项逻辑自检）、`npm run check:web`（浏览器冒烟测试）。

## 文件位置

- 游戏数值（战力/难度曲线/消耗）：`src/game/config.js`
- 剧情文案（角色列传/动物故事/据点志异/终章）：`src/game/story.js`
- 规则引擎：`src/game/engine.js`
- MCP 接入与离线兜底：`src/mcp/mcdApi.js`
