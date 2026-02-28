# Todo Harbor

一个支持历史记录与完成状态持久化的待办事项网站。  
技术架构：`Node.js + Express + SQLite + Docker + Cloudflare Tunnel`。

## 功能

- 新增待办事项（支持填写项目、到期日期、父任务）
- 任务属性支持：`优先级 / 状态 / 标签`
- 支持任务提醒时间（`reminderAt`，格式 `YYYY-MM-DDTHH:mm`）
- 周期任务（每天/每周/每月），完成后自动生成下一期任务
- 新增区支持 `单条录入 / 批量录入` 两种模式
- 切换完成/未完成状态
- 按 `全部 / 进行中 / 已完成` 过滤
- 服务端分页 + “加载更多”
- 层级任务（父任务/子任务）展示
- 视图切换：普通视图 / 按项目分组 / 按到期日分组
- 统计总数、进行中、已完成数量
- 批量修改项目/到期日（页面内弹窗）
- 导出/导入 JSON、支持多步撤销（Undo）
- 注册/登录（数据按账号隔离）
- 页面顶部显示当前版本号（含可选 Git 短 SHA）
- SQLite 持久化保存（重启容器后数据仍保留）

## 项目结构

```text
todo-harbor/
  public/                # 前端页面（HTML/CSS/JS）
  src/                   # 后端 API 与数据库逻辑
  data/                  # SQLite 数据目录（持久化挂载）
  Dockerfile
  docker-compose.yml
```

## 本地运行

```bash
npm install
npm run dev
```

访问：`http://127.0.0.1:3000`（如 3000 端口被占用，可通过 `PORT=3100 npm run dev` 调整）

建议设置会话密钥（避免重启导致会话失效）：

```bash
export SESSION_SECRET="your-strong-secret"
```

如需强制邮箱验证后才能访问待办：

```bash
export REQUIRE_EMAIL_VERIFICATION=1
```

## 自动化测试

```bash
npm test
```

## Docker 部署（推荐，仅应用容器）

```bash
docker compose up -d --build
```

- 本机访问地址：`http://127.0.0.1:18080`
- 数据持久化目录：`./data`（映射到容器内 `/app/data`）
- 健康检查：容器会周期访问 `/api/health`，可用 `docker compose ps` 查看健康状态

停止服务：

```bash
docker compose down
```

## 公网访问（named cloudflared tunnel）

当前设备已创建 named tunnel（常驻 systemd）：

- tunnel name: `todo-harbor-20260225`
- domain: `todo-harbor.biglone.tech`
- service: `http://127.0.0.1:18080`
- systemd service: `cloudflared-todo-harbor-20260225.service`

验证公网访问：

```bash
curl -I https://todo-harbor.biglone.tech
```

查看 tunnel 服务状态：

```bash
systemctl status cloudflared-todo-harbor-20260225.service
journalctl -u cloudflared-todo-harbor-20260225.service -f
```

## 已实现 API

- `GET /api/health`
- `GET /api/version`（返回 `version` 与可选 `gitSha`）
- `POST /api/auth/register`
  - `email: string`
  - `password: string`（8-72 位）
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/auth/verification/request`（重新发送验证邮件）
- `POST /api/auth/verify`（提交验证码）
- `POST /api/auth/password/forgot`（请求密码重置）
- `POST /api/auth/password/reset`（提交新密码）
- `GET /api/account`（账号信息）
- `POST /api/account/email`（修改邮箱，需当前密码）
- `POST /api/account/password`（修改密码）
- `GET /api/todos?filter=all|active|completed&q=&project=&priority=low|medium|high&status=todo|in_progress|blocked&dueFrom=YYYY-MM-DD&dueTo=YYYY-MM-DD&sort=created_desc|created_asc|due_asc|due_desc&dueScope=all|overdue|today|week|no_due&page=1&pageSize=60`
  - 返回 `pagination`（分页信息）与 `dueSnapshot`（到期分布快照）
- `GET /api/todos/meta`（返回项目列表、可选父任务、undo 可用状态）
- `GET /api/todos/export`（导出 JSON）
- `POST /api/todos`（body 支持）
  - `title: string`（必填）
  - `project?: string`（可选，默认 `默认项目`）
  - `dueDate?: YYYY-MM-DD`（可选）
  - `reminderAt?: YYYY-MM-DDTHH:mm`（可选）
  - `parentId?: number`（可选，表示创建子任务）
  - `priority?: low|medium|high`（可选，默认 `medium`）
  - `status?: todo|in_progress|blocked`（可选，默认 `todo`）
  - `recurrence?: none|daily|weekly|monthly`（可选，默认 `none`；启用时需提供 `dueDate`）
  - `tags?: string[] | "a,b,c"`（可选）
- `POST /api/todos/bulk`（批量创建）
  - `titles: string[]`（必填，每个元素是一条任务标题）
  - `project?: string`
  - `dueDate?: YYYY-MM-DD`
  - `reminderAt?: YYYY-MM-DDTHH:mm`
  - `parentId?: number`
  - `priority?: low|medium|high`
  - `status?: todo|in_progress|blocked`
  - `recurrence?: none|daily|weekly|monthly`
  - `tags?: string[] | "a,b,c"`
- `POST /api/todos/batch`（批量更新当前任务集合）
  - `ids: number[]`（必填）
  - `completed?: boolean`
  - `project?: string`
  - `dueDate?: YYYY-MM-DD | null`
  - `reminderAt?: YYYY-MM-DDTHH:mm | null`
  - `priority?: low|medium|high`
  - `status?: todo|in_progress|blocked`
  - `recurrence?: none|daily|weekly|monthly`（设置为非 `none` 时需同时传 `dueDate`）
  - `tags?: string[] | "a,b,c"`
  - 响应包含 `count` 与 `skipped`（例如批量完成时会跳过仍有未完成子任务的父任务）
- `POST /api/todos/import`
  - body 支持 `{"mode":"merge"|"replace","items":[...]}` 或直接传数组
  - `replace` 会先清空现有数据
  - 单次导入最多 5000 条
- `POST /api/todos/undo`（撤销最近一步变更，可连续调用实现多步撤销）
- `PATCH /api/todos/:id`（编辑任务标题/项目/到期日期/父任务/优先级/状态/周期/标签）
- `DELETE /api/todos/:id`（删除任务，含其子任务）
- `DELETE /api/todos/completed`（清理全部已完成任务）
- `PATCH /api/todos/:id/toggle`
  - 若任务设置了 `recurrence`，标记完成时会自动创建下一期未完成任务

## 日志规范

- 所有请求与错误日志以 JSON 行输出到 stdout
- 关键字段：`timestamp`、`method`、`path`、`status`、`durationMs`

## 安全与限流

- 鉴权相关接口已启用基础频率限制（登录、注册、验证码、密码重置、账号更新等）。
- 触发限流时返回 `429`，并包含 `retryAfterSec` 与 `Retry-After` 响应头。
- 可通过环境变量调整：
  - `AUTH_RATE_LIMIT_WINDOW_MS`（默认 `600000`，即 10 分钟）
  - `AUTH_RATE_LIMIT_MAX`（默认 `120`）
  - `AUTH_LOGIN_RATE_LIMIT_MAX`（默认 `40`）
  - `AUTH_REGISTER_RATE_LIMIT_MAX`（默认 `30`）
  - `AUTH_RESET_RATE_LIMIT_MAX`（默认 `30`）

## 邮箱验证与密码重置说明

- 本地/开发模式下，验证与重置码会直接返回在响应中并打印到日志，便于测试。
- 生产环境建议接入邮件服务，隐藏验证码输出。

## 邮件发送（SMTP）

生产环境请配置以下环境变量以发送验证码邮件：

- `SMTP_HOST`（例如 `smtp.gmail.com`）
- `SMTP_PORT`（465 或 587）
- `SMTP_SECURE`（端口 465 通常为 `true`，587 为 `false`）
- `SMTP_USER`（邮箱账号）
- `SMTP_PASS`（邮箱 App Password）
- `SMTP_FROM`（发件人地址，可与 `SMTP_USER` 相同）
- `APP_BASE_URL`（生成邮件中的验证/重置链接，例如 `https://todo-harbor.example.com`）

Gmail 示例：

```bash
export SMTP_HOST="smtp.gmail.com"
export SMTP_PORT=465
export SMTP_SECURE=true
export SMTP_USER="yourname@gmail.com"
export SMTP_PASS="your-app-password"
export SMTP_FROM="yourname@gmail.com"
export APP_BASE_URL="https://todo-harbor.example.com"
```

## 发布与回滚

发布（Docker Compose）：

```bash
docker compose up -d --build
docker compose ps
curl http://127.0.0.1:18080/api/health
```

回滚：

```bash
git checkout <上一稳定提交>
docker compose up -d --build
docker compose ps
```

说明：数据保存在 `./data`，回滚不会清空数据。

## Push 触发自动部署（无轮询）

项目内已提供：

- 脚本：`scripts/auto-deploy-on-remote-update.sh`
- GitHub Webhook 监听器：`scripts/github-push-webhook.js`
- systemd 用户级模板：`deploy/systemd/todo-harbor-github-webhook.service`
- 环境变量模板：`deploy/webhook.env.example`

安装（当前用户）：

```bash
mkdir -p ~/.config/todo-harbor
cp deploy/webhook.env.example ~/.config/todo-harbor/deploy-webhook.env
# 编辑 deploy-webhook.env，设置 WEBHOOK_SECRET（强随机字符串）

mkdir -p ~/.config/systemd/user
cp deploy/systemd/todo-harbor-github-webhook.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now todo-harbor-github-webhook.service
```

然后在 GitHub 仓库配置 Webhook：

- URL：`https://todo-harbor.biglone.tech/webhooks/github/todo-harbor`
- Content type：`application/json`
- Secret：与 `WEBHOOK_SECRET` 一致
- Events：只勾选 `Push`

说明：

- 每次 push 到 `origin/master`，GitHub 会立即回调本机 Webhook。
- 回调后会执行 `git pull --ff-only` + `docker compose up -d --build --remove-orphans`。
- 部署状态记录在本地 `.deploy-state/last_deployed_sha`，用于确保每次推送后的新提交只部署一次。
- Webhook 日志：`journalctl --user -u todo-harbor-github-webhook.service -f`
