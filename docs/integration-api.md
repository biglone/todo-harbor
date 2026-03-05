# Todo Harbor 外部集成 API 文档

本文档面向“外部调用方”（例如 `robotics-dev-career-lab`），用于将任务同步到 Todo Harbor。

OpenAPI 规范文件：`docs/openapi-integration.yaml`

## 1. 概览

- Base URL（本地默认）: `http://127.0.0.1:3000`
- 内容类型: `application/json`
- 鉴权方式:
  - Token 管理接口: 使用网页登录态（session cookie）
  - 同步接口: `Authorization: Bearer thk_xxx`

当前外部集成相关接口：

1. `GET /api/integrations/tokens`
2. `POST /api/integrations/tokens`
3. `DELETE /api/integrations/tokens/:id`
4. `POST /api/integrations/todos/sync`

## 2. 认证与权限

### 2.1 Token 管理接口（平台侧）

用于创建/查看/撤销集成 token，必须是已登录用户调用（浏览器 session）。

### 2.2 同步接口（调用方）

调用方使用 bearer token 调用同步接口：

```http
Authorization: Bearer thk_xxx
```

- token 只在创建时返回一次明文，请妥善保存。
- token 被撤销后，再调用会返回 `401 Invalid integration token`。

## 3. 字段规范

### 3.1 `source`

- 类型: `string`
- 规则: 小写，`[a-z0-9._-]`，长度 `1-80`
- 用途: 标识调用方来源（例如 `robotics-dev-career-lab`）

### 3.2 `ExternalTodo`（同步项）

- `externalId?: string` 建议必传，长度 `<=120`，作为幂等键
- `title: string` 必填，长度 `1-200`
- `project?: string` 长度 `1-80`，默认取 `defaultProject` 或 `source`
- `dueDate?: string` 格式 `YYYY-MM-DD`
- `reminderAt?: string` 格式 `YYYY-MM-DDTHH:mm`
- `priority?: low|medium|high`
- `status?: todo|in_progress|blocked`
- `recurrence?: none|daily|weekly|monthly`
- `tags?: string[] | "a,b,c"`（最多 20 个标签，单个截断到 20 字符）

约束：

1. 当 `recurrence != "none"` 时，必须提供 `dueDate`
2. 同一请求内 `externalId` 不能重复（大小写不敏感）

## 4. 接口详情

### 4.1 查询 token 列表

`GET /api/integrations/tokens`

请求头：

```http
Cookie: todo_harbor_session=...
```

响应 `200`：

```json
{
  "items": [
    {
      "id": 2,
      "name": "Robotics Plan Sync",
      "source": "robotics-dev-career-lab",
      "tokenHint": "thk_abcd12...9f0a",
      "lastUsedAt": "2026-03-06T02:10:11.123Z",
      "revokedAt": null,
      "createdAt": "2026-03-06T01:00:00.000Z"
    }
  ]
}
```

说明：不会返回 token 明文。

### 4.2 创建 token

`POST /api/integrations/tokens`

请求体：

```json
{
  "name": "Robotics Plan Sync",
  "source": "robotics-dev-career-lab"
}
```

响应 `201`：

```json
{
  "id": 3,
  "name": "Robotics Plan Sync",
  "source": "robotics-dev-career-lab",
  "tokenHint": "thk_7f31d...cc2a",
  "lastUsedAt": null,
  "revokedAt": null,
  "createdAt": "2026-03-06T02:20:00.000Z",
  "token": "thk_7f31d....",
  "note": "Token is only returned once. Please store it securely."
}
```

常见错误：

1. `400 name is required`
2. `400 source is invalid (...)`
3. `401 Unauthorized`（未登录）
4. `403 Email not verified`（启用邮箱验证时）

### 4.3 撤销 token

`DELETE /api/integrations/tokens/:id`

响应 `200`：

```json
{
  "ok": true,
  "revokedId": 3
}
```

常见错误：

1. `400 id must be a positive integer`
2. `404 token not found`

### 4.4 同步任务（外部调用核心接口）

`POST /api/integrations/todos/sync`

请求头：

```http
Authorization: Bearer thk_xxx
Content-Type: application/json
```

请求体：

```json
{
  "source": "robotics-dev-career-lab",
  "defaultProject": "机器人学习计划",
  "items": [
    {
      "externalId": "week1-day1",
      "title": "Week1 Day1 安装 ROS2 Jazzy",
      "dueDate": "2026-03-06",
      "tags": ["robotics", "week1", "day1"],
      "status": "todo"
    },
    {
      "externalId": "week1-day2",
      "title": "Week1 Day2 完成 pub/sub demo",
      "dueDate": "2026-03-07",
      "status": "todo"
    }
  ]
}
```

响应 `201`：

```json
{
  "source": "robotics-dev-career-lab",
  "count": 2,
  "created": 1,
  "updated": 1,
  "items": [
    {
      "action": "updated",
      "externalId": "week1-day1",
      "todo": {
        "id": 101,
        "title": "Week1 Day1 安装 ROS2 Jazzy",
        "project": "机器人学习计划",
        "due_date": "2026-03-06",
        "reminder_at": null,
        "parent_id": null,
        "priority": "medium",
        "status": "todo",
        "recurrence": "none",
        "tags": ["robotics", "week1", "day1"],
        "completed": false,
        "created_at": "2026-03-06 10:00:00",
        "completed_at": null
      }
    }
  ],
  "stats": {
    "total": 27,
    "completed": 8,
    "active": 19
  }
}
```

## 5. 幂等与去重规则

如果传了 `externalId`，系统按 `(user_id, source, externalId)` 做 upsert：

1. 首次提交: 创建 todo，并建立映射
2. 重复提交同 key: 更新已有 todo，不重复创建
3. 未传 `externalId`: 每次都按新任务创建

建议：调用方务必稳定传 `externalId`。

## 6. 限制与错误码

### 6.1 限制

1. `items` 每次最多 `1000` 条
2. `externalId` 最长 `120`
3. `title` 最长 `200`
4. `project` 最长 `80`

### 6.2 常见错误返回

`401`

```json
{ "error": "Missing integration token" }
```

或

```json
{ "error": "Invalid integration token" }
```

`400`

```json
{ "error": "items is required and must be a non-empty array" }
```

或

```json
{ "error": "items[0]: dueDate must be a valid date in YYYY-MM-DD format" }
```

`403`

```json
{ "error": "Email not verified" }
```

## 7. 快速接入示例

### 7.1 cURL

```bash
curl -X POST http://127.0.0.1:3000/api/integrations/todos/sync \
  -H "Authorization: Bearer thk_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "source":"robotics-dev-career-lab",
    "defaultProject":"机器人学习计划",
    "items":[
      {"externalId":"week1-day1","title":"Week1 Day1 安装 ROS2 Jazzy","dueDate":"2026-03-06"},
      {"externalId":"week1-day2","title":"Week1 Day2 完成 pub/sub demo","dueDate":"2026-03-07"}
    ]
  }'
```

### 7.2 Node.js（fetch）

```js
const res = await fetch("http://127.0.0.1:3000/api/integrations/todos/sync", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: "Bearer thk_xxx",
  },
  body: JSON.stringify({
    source: "robotics-dev-career-lab",
    defaultProject: "机器人学习计划",
    items: [
      { externalId: "week1-day1", title: "Week1 Day1 安装 ROS2 Jazzy", dueDate: "2026-03-06" },
      { externalId: "week1-day2", title: "Week1 Day2 完成 pub/sub demo", dueDate: "2026-03-07" },
    ],
  }),
});

const data = await res.json();
if (!res.ok) throw new Error(JSON.stringify(data));
console.log(data);
```

## 8. 调用方最佳实践

1. `externalId` 保持稳定且可追踪（如 `week{n}-day{m}`）
2. 同步采用“全量重推 + 幂等 upsert”模式，简化重试与恢复
3. token 按调用方隔离（一个系统一个 token）
4. 周期性轮换 token，并及时撤销不再使用的 token
