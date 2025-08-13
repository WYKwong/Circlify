## 模块化服务设计：Trades（多实例商品集市）

本修订版采用“每个服务实例一个 `BoardServiceSettings` 记录”的模型：
- `SK` 使用每个实例的唯一 `serviceId`（例如某个交易集市实例的 `serviceId = trade-租房`）。
- 保留 `serviceType = 'trades'` 字段；对允许多实例的类型，其 `isDefault = false`；对单例服务（如 `approveJoin`）则恒为 `true`。
- 通过 GSI 支持“按板块列举”和“按 serviceId 直查”的访问路径：
  - GSI1：`GSI1PK = BOARD#<boardId>`，`GSI1SK = SERVICETYPE#<serviceType>#<serviceId>`
  - GSI2：`GSI2PK = SERVICE#<serviceId>`，`GSI2SK = BOARD#<boardId>`

### 目标
- 与现有模块化服务模型完全兼容：在 `AvailableServices` 增加一条 `trades` 后，前端“创建/编辑板块”界面会自动显示该服务（无需额外 UI 改造）。
- 一个板块可以有多个 Trade 实例，每个实例具备：名称（可重名）、排序序号（优先展示）。
- 独立商品数据表，按 Trade 实例维度归类；为权限校验与级联清理方便，同时冗余存储 `boardId`。
- 提供图片上传能力，采用 S3 预签名直传；后端负责颁发上传 URL 并落表保存对象 Key。

---

## 一、与现有模块化服务的衔接

### 1) AvailableServices（服务目录）
- 新增目录项：
```json
{
  "PK": "SERVICETYPE#trades",
  "SK": "META",
  "serviceType": "trades",
  "displayName": "商品集市（Trades）",
  "description": "为板块开启多实例的交易/集市能力，支持商品发布与图片上传"
}
```
- 效果：`GET /services` 将返回该服务；前端“服务开关”列表中可见并可勾选。

### 2) BoardServiceSettings（每板块、每个 trades 实例一条记录）
- 主键：`PK = BOARD#<boardId>`，`SK = SERVICE#<serviceId>`。
- 字段：`boardId`, `serviceId`, `serviceType = 'trades'`, `isDefault = false`, `config`（实例专属配置）。
- 索引：
  - GSI1：`GSI1PK = BOARD#<boardId>`，`GSI1SK = SERVICETYPE#trades#<serviceId>` → 按板块列举所有 trades 实例，或指定类型筛选。
  - GSI2：`GSI2PK = SERVICE#<serviceId>`，`GSI2SK = BOARD#<boardId>` → 已知 `serviceId` 直查归属板块与配置。
- 示例：
```json
{
  "PK": "BOARD#b-001",
  "SK": "SERVICE#t-001",
  "boardId": "b-001",
  "serviceId": "t-001",
  "serviceType": "trades",
  "isDefault": false,
  "GSI1PK": "BOARD#b-001",
  "GSI1SK": "SERVICETYPE#trades#t-001",
  "GSI2PK": "SERVICE#t-001",
  "GSI2SK": "BOARD#b-001",
  "config": { "name": "自由市场", "status": "active", "createdAt": "2025-08-13T10:00:00Z", "updatedAt": "2025-08-13T10:00:00Z" }
}
```

### 3) BoardServicePermissions（管理者粒度权限）
- 仍沿用统一模式：`PK=BOARD#<boardId>#SERVICE#trades`, `SK=USER#<userId>`。
- 语义：拥有 `trades` 权限的经理可以管理本板块的 Trade 实例与商品（创建、更新、删除、商品上/下架、发放预签名上传 URL 等）；板块所有者隐式允许；普通成员默认只读/受限（见“权限与可见性”部分）。

---

## 二、DynamoDB 表设计（修订后）

trades 实例由 `BoardServiceSettings` 的多条记录承载（每实例一条）。商品数据单独存表：

### TradeItems（商品表）
- 用途：按 Trade 实例维度存储商品。为便于权限校验与清理，冗余存 `boardId`。
- 主键：
  - `PK = TRADE#<tradeId>`
  - `SK = ITEM#<itemId>`
- 字段建议：
```json
{
  "PK": "TRADE#<tradeId>",
  "SK": "ITEM#<itemId>",
  "boardId": "<boardId>",
  "tradeId": "<tradeId>",
  "itemId": "<uuid>",
  "title": "二手键盘",
  "price": 19900,                
  "currency": "CNY",
  "desc": "自用九成新，附赠键帽",
  "images": [
    { "key": "boards/<boardId>/trades/<tradeId>/items/<itemId>/img-1.jpg", "width": 1280, "height": 960 }
  ],
  "status": "active",           
  "createdBy": "<userId>",
  "createdAt": "2025-08-13T10:00:00Z",
  "updatedAt": "2025-08-13T10:00:00Z"
}
```
- 典型访问：
  - 列表某实例所有商品：`Query PK=TRADE#<tradeId>`。
  - 按板块聚合（可选）：添加 `boardId-index`（`GSI2PK=BOARD#<boardId>`, `GSI2SK=TRADE#<tradeId>#ITEM#<itemId>`），用于运营/清理等场景。

关于“是否需要在商品表关联 `boardId`”：建议“需要”。理由：
- 读写路径中频繁需要进行板块级权限校验（所有者/经理/成员）。
- 便于在禁用 `trades` 服务或删除板块时进行级联删除/审计。
- 便于后续做板块级聚合或导出统计。

---

## 三、API 与服务流程（NestJS Lambda）

以下仅定义接口与职责，具体实现沿用现有风格（控制器+Service+基于 ConfigService 的表名配置）：

### 1) Trade 实例管理（需 owner 或被授予 `trades` 的 manager）
- `POST /boards/:boardId/trades`
  - body: `{ name: string }`
  - 功能：创建 Trade 实例：生成 `tradeId`（即 `serviceId`），写入一条 `BoardServiceSettings` 记录（`serviceType='trades'`），`config` 中保存名称、状态与时间戳。
- `GET /boards/:boardId/trades`
  - 功能：通过 GSI1 列举本板块的所有 `serviceType='trades'` 的设置条目，映射为实例列表返回。
- `PUT /boards/:boardId/trades/:tradeId`
  - body: `{ name?: string, status?: 'active'|'archived' }`
  - 功能：更新对应 `serviceId = tradeId` 的 `BoardServiceSettings.config`。
- `DELETE /boards/:boardId/trades/:tradeId`
  - 功能：删除 `BoardServiceSettings` 该实例的条目，并级联清理 `TradeItems`；图片异步清理。

### 2) 商品管理（需 owner 或被授予 `trades` 的 manager；读权限见下）
- `POST /boards/:boardId/trades/:tradeId/items`
  - body: `{ title, price, currency, desc }`
  - 功能：创建商品，返回 `itemId`。
- `GET /boards/:boardId/trades/:tradeId/items`
  - 功能：分页列出商品（按照 `createdAt` DESC 或自定义排序）。
- `GET /boards/:boardId/trades/:tradeId/items/:itemId`
  - 功能：读取商品详情。
- `PUT /boards/:boardId/trades/:tradeId/items/:itemId`
  - body: `{ title?, price?, currency?, desc?, status? }`
  - 功能：更新商品信息/上下架。
- `DELETE /boards/:boardId/trades/:tradeId/items/:itemId`
  - 功能：删除商品，图片处理见“清理策略”。

### 3) 图片上传（S3 预签名直传）
- `POST /boards/:boardId/trades/:tradeId/items/:itemId/upload-url`
  - body: `{ fileName: string, contentType: string }`
  - 返回：`{ url, fields? , key }`（推荐使用 S3 `PutObject` 的签名 URL；若走 POST 表单则返回 `fields`）。
  - 前端将文件直传 S3，成功后调用：
    - `POST /boards/:boardId/trades/:tradeId/items/:itemId/images` with `{ key, width?, height? }`，把对象 Key 写入 `images[]`。

### 4) 权限与可见性（建议）
- 写接口：板块所有者 implicit allow；`BoardServicePermissions` 中拥有 `trades` 的经理 allow；其他用户 deny。
- 读接口：
  - 列表/查看 Trade 实例与商品：板块成员（owner/manager/member）可见；非成员可选策略为 deny（与当前板块加入模型一致）。如将来需要“公开交易”，再扩展可见性字段。

### 5) 服务开关的联动
- 启用 `trades`：仅将 `trades` 加入 `Boards.enabledServices`，不强制创建实例。实例通过专门接口创建。
- 禁用 `trades`：
  - 通过 GSI1 列举该板块全部 `serviceType='trades'` 的设置条目，逐个：
    - 批量删除其 `TradeItems`（可分批/异步）。
    - 删除对应的 `BoardServiceSettings` 条目。
  - 可选：撤销 `BoardServicePermissions`。

---

## 四、S3 开启与配置（从零开始）

### 1) 资源准备
- 创建 S3 Bucket（建议区域与 Lambda 相同），命名示例：`circlify-attachments-<env>`。
- 开启 CORS（供前端直传）：
```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["PUT", "POST", "GET"],
    "AllowedOrigins": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```
- 建议目录前缀：`boards/<boardId>/trades/<tradeId>/items/<itemId>/...`

### 2) IAM 权限
- 给后端执行角色授予最小权限：
  - `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject`
  - `s3:AbortMultipartUpload`, `s3:ListBucket`（如需）
- Serverless 配置（示例片段，实际需加到 `backend/serverless.yml`）：
```yaml
provider:
  environment:
    ATTACHMENTS_BUCKET: ${env:ATTACHMENTS_BUCKET, 'circlify-attachments-dev'}
  iamRoleStatements:
    - Effect: Allow
      Action:
        - s3:PutObject
        - s3:GetObject
        - s3:DeleteObject
        - s3:AbortMultipartUpload
      Resource: arn:aws:s3:::${env:ATTACHMENTS_BUCKET, 'circlify-attachments-dev'}/*
```

### 3) 后端实现要点
- 使用 `@aws-sdk/client-s3` 与 `@aws-sdk/s3-request-presigner` 生成预签名 URL。
- 统一记录对象 `key` 到 `TradeItems.images[]`，不要把完整 URL 落表，便于换域/迁移。
- 下载展示时由后端生成受控访问（如需），或前端用公开读策略（不建议全公开；更安全是私有桶+后端颁发带时效的 GET URL）。

### 4) 前端直传流程
1. 创建商品 → 拿到 `itemId`。
2. 请求上传 URL：提交 `fileName`/`contentType`。
3. 用返回的 `url` 直接上传二进制。
4. 调用“写回 images”接口，持久化 `key`、尺寸等元数据。

---

## 五、清理策略
- 删除商品：仅删除表项，并可异步触发删除 S3 对象（可在任务队列/定时器里做，避免阻塞 API）。
- 删除 Trade 实例：批量列出并删除其 `TradeItems`；图片清理同上。
- 禁用 `trades`：对整个板块触发级联清理（BoardTrades 与 TradeItems），图片异步清理。

---

## 六、任务清单（实施顺序）

### A. 数据与配置
- [ ] 在 `AvailableServices` 表种子新增：`SERVICETYPE#trades`（displayName/description 如上）。
- [ ] 在 `backend/src/config/tables.config.ts` 增加表名常量（仅设计，后续实现时添加）：
  - `TRADE_ITEMS_TABLE: 'TradeItems'`
- [ ] 在 `backend/serverless.yml` 新增 `TRADE_ITEMS_TABLE` 资源与环境变量；并新增 S3 相关 environment 与 IAM。

### B. 后端接口与服务
- [ ] 新建 `boards/trades.controller.ts` 与 `boards/trades.service.ts`：
  - 操作目标为 `BoardServiceSettings`：创建/更新/删除实例、重排顺序（定点 `UpdateExpression`）。
  - 并发：读取 `rev` 并在 `ConditionExpression` 中校验；成功后 `rev = rev + 1`。
  - 权限：owner 或 `trades`-manager。
- [ ] 新建 `boards/trade-items.controller.ts` 与 `boards/trade-items.service.ts`：
  - 商品 CRUD（基于 `TradeItems`）。
  - 预签名上传 URL 与回写 `images`。
  - 权限：同上；读取放开给成员。
- [ ] 在 `board.module.ts` 注册上述 Service/Controller。
- [ ] 在禁用服务路径中，增加 `trades` 级联清理：先读取 `config.instances` 获取全部 `tradeId`，批删对应 `TradeItems`，最后删 `BoardServiceSettings` 的该项。

### C. 前端（最小改动）
- [ ] 由于 `GET /services` 已自动包含 `trades`，设置面板会出现该服务开关；无需新增配置 UI。
- [ ] 新增“Trade 管理”与“商品管理”的简单页面/对话框：
  - 列表、创建/修改实例（名称、排序）。
  - 列表、创建/修改商品；上传图片（调用预签名上传）。
- [ ] 在 `PermissionSelector` 中无需改动（基于服务 key 枚举，`trades` 会自然出现）。

### D. 测试与清理
- [ ] 单元测试：Service 层的 CRUD、权限检查、排序重排逻辑。
- [ ] 并发测试：两个管理者同时创建/更名/重排实例的冲突处理（`rev` 条件写）。
- [ ] 集成测试：上传 URL -> PUT 上传 -> 回写 image -> 前端展示。
- [ ] 禁用 `trades` 的级联清理与权限回收验证。

---

## 七、示例数据（便于联调）

### 1) AvailableServices
```json
{
  "PK": "SERVICETYPE#trades",
  "SK": "META",
  "serviceType": "trades",
  "displayName": "商品集市（Trades）",
  "description": "为板块开启多实例的交易/集市能力，支持商品发布与图片上传"
}
```

### 2) BoardServiceSettings（trades 配置示例）
```json
{
  "PK": "BOARD#b-001",
  "SK": "SERVICE#t-001",
  "boardId": "b-001",
  "serviceId": "t-001",
  "serviceType": "trades",
  "isDefault": false,
  "GSI1PK": "BOARD#b-001",
  "GSI1SK": "SERVICETYPE#trades#t-001",
  "GSI2PK": "SERVICE#t-001",
  "GSI2SK": "BOARD#b-001",
  "config": { "name": "自由市场", "status": "active", "createdAt": "2025-08-13T10:00:00Z", "updatedAt": "2025-08-13T10:00:00Z" }
}
```

### 3) TradeItems
```json
{
  "PK": "TRADE#t-001",
  "SK": "ITEM#i-001",
  "boardId": "b-001",
  "tradeId": "t-001",
  "itemId": "i-001",
  "title": "二手键盘",
  "price": 19900,
  "currency": "CNY",
  "desc": "自用九成新，附赠键帽",
  "images": [
    { "key": "boards/b-001/trades/t-001/items/i-001/img-1.jpg", "width": 1280, "height": 960 }
  ],
  "status": "active",
  "createdBy": "u-001",
  "createdAt": "2025-08-13T10:00:00Z",
  "updatedAt": "2025-08-13T10:00:00Z"
}
```

---

## 八、实现指引要点汇总
- 仍以 `serviceType = 'trades'` 作为服务标识接入当前模块化服务能力：开关、设置、权限一致（权限表项使用相同 key）。
- 多实例集中保存到 `BoardServiceSettings.config.instances`；用 `order` 维护排序，`rev` 保障并发。
- 商品与图片归属到 `TradeItems`，并冗余 `boardId` 以便权限校验与清理。
- S3 采用“预签名直传”，后端只负责签名与落表；桶保持私有，必要时下发受限 GET URL。
- 禁用服务需考虑级联删除策略与异步清理图片。


