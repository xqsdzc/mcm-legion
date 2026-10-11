# MCP 集成说明（MCP_INTEGRATION.md）

本文档说明「麦麦军团」实际使用的麦当劳 MCP Server、Tool、调用流程与业务价值。

## 1. MCP Server

| 项 | 值 |
|---|---|
| Server | 麦当劳中国 MCP Server（官方） |
| Endpoint | `https://mcp.mcd.cn` |
| 传输协议 | Streamable HTTP |
| 鉴权 | `Authorization: Bearer <MCD_MCP_TOKEN>`（Token 由用户在 <https://open.mcd.cn/mcp/doc> 申请） |
| 客户端 SDK | `@modelcontextprotocol/sdk`（`Client` + `StreamableHTTPClientTransport`） |

Token 仅从环境变量 `MCD_MCP_TOKEN` 读取（见 `.env.example`），不写入代码、不提交仓库、不进入本地数据库。

## 2. 实际使用的 Tool

| MCP Tool | 游戏内的作用 | 调用时机 |
|---|---|---|
| `query-nearby-stores` | 「打卡」收集麦麦将军与麦麦军。优先取收藏餐厅（`searchType=1`），为空时按城市关键词搜索（`searchType=2`，`city`/`keyword` 取 `MCD_CITY`/`MCD_KEYWORD`）。返回的 `storeName` 直接成为该店**麦麦将军的名字** | 玩家点击「打卡」并选择门店时 |
| `order-list` | 「今日订单奖励」。按 `createTime` 过滤当日订单，**每笔订单兑换 1 名随机美食战士** | 玩家点击「今日订单」时 |

未使用但不排除后续扩展：`query-my-account`（积分账户，可映射为军团声望）、`now-time-info`（服务器时间校准）、`available-coupons`（优惠券Buff）等。

## 3. 调用流程

```
玩家点击「打卡」
   └─ GET /api/stores
        └─ engine.clockinStores()
             └─ McdApi.getStores()
                  ├─ mode=online → MCP callTool("query-nearby-stores", { beType:1, searchType:1 })
                  │     收藏为空 → callTool("query-nearby-stores", { beType:1, searchType:2, city, keyword })
                  └─ mode=offline（无 Token/连接失败）→ 内置演示门店（MOCK.stores）
   └─ POST /api/clockin { storeCode }
        └─ 同一门店每天限一次；首次且未拥有该店将军 → 获得「门店名」将军 x1 + 麦麦军 x3
           已拥有该店将军 → 仅获得麦麦军 x3

玩家点击「今日订单」
   └─ POST /api/orders
        └─ McdApi.getTodayOrders()
             ├─ online → callTool("order-list") → 按日期过滤未领订单
             └─ offline → 按日期确定性生成 1~3 笔演示订单
        └─ 每笔未领订单 → 1 名随机美食战士（同一订单 ID 结果确定，可复现）
```

### 与游戏状态的衔接

- 打卡得到的**门店名**写入 `stores` 表（打卡地图鉴）与将军单位；将军被建设消耗后，该店 `has_general` 置 0，之后再次打卡可重新获得——形成「店长轮换」循环。
- 订单得到的战士写入 `units` 表，是军团的主力战力，会在攻略中按 30%/阶段损耗。
- 所有 MCP 数据只用于**当次动作结算**，不做全量缓存；玩家的长期进度存于本地 SQLite。

## 4. 离线演示模式（无 Token 可玩）

未配置 `MCD_MCP_TOKEN` 或 MCP 连接失败时，游戏自动降级为**演示模式**：

- `query-nearby-stores` → 8 个内置示例门店；
- `order-list` → 按日期确定性生成 1~3 笔演示订单；
- 界面顶栏显示「演示模式」徽标，配置 Token 后重启即为「MCP 实时」模式。

这保证评委与合作者在没有 Token 的环境下也能完整体验游戏全流程，同时**抽奖/偶遇均为本地确定性随机**，不消耗任何真实积分或麦当劳权益。

## 5. 业务价值

1. **把交易数据变成游戏进度**：用户真实的到店打卡与当日订单直接转化为收集要素，打通「消费行为 → 情感积累 → 回访动机」的闭环。
2. **门店即内容**：`query-nearby-stores` 返回的每一家真实门店都是一个具名的麦麦将军与一座待建设的据点，MCP 数据天然构成无限扩展的游戏地图。
3. **安全合规**：Token 走环境变量，接口只读（查询门店/订单），不产生任何下单、支付等写操作。

## 6. 接口响应结构（实测）

`order-list` 返回 `{ success, code, data: { list: [{ orderId, createTime, storeName, orderProductList, realTotalAmount, ... }] } }`；
`query-nearby-stores` 返回 `{ success, code, data: [{ storeCode, storeName, address, distance, ... }] }`。
客户端对两种结构均做了解析与兜底（`src/mcp/mcdApi.js`）。
