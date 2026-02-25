# Todo Harbor

一个支持历史记录与完成状态持久化的待办事项网站。  
技术架构：`Node.js + Express + SQLite + Docker + Cloudflare Tunnel`。

## 功能

- 新增待办事项（支持填写项目、任务日期、父任务）
- 新增区支持 `单条录入 / 批量录入` 两种模式
- 切换完成/未完成状态
- 按 `全部 / 进行中 / 已完成` 过滤
- 层级任务（父任务/子任务）展示
- 视图切换：普通视图 / 按项目分组 / 按日期分组
- 统计总数、进行中、已完成数量
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

## Docker 部署（推荐，仅应用容器）

```bash
docker compose up -d --build
```

- 本机访问地址：`http://127.0.0.1:18080`
- 数据持久化目录：`./data`（映射到容器内 `/app/data`）

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
- `GET /api/todos?filter=all|active|completed&q=&project=&dueFrom=YYYY-MM-DD&dueTo=YYYY-MM-DD&sort=created_desc|created_asc|due_asc|due_desc`
- `GET /api/todos/meta`（返回项目列表与可选父任务）
- `POST /api/todos`（body 支持）
  - `title: string`（必填）
  - `project?: string`（可选，默认 `默认项目`）
  - `dueDate?: YYYY-MM-DD`（可选）
  - `parentId?: number`（可选，表示创建子任务）
- `POST /api/todos/bulk`（批量创建）
  - `titles: string[]`（必填，每个元素是一条任务标题）
  - `project?: string`
  - `dueDate?: YYYY-MM-DD`
  - `parentId?: number`
- `POST /api/todos/batch`（批量更新当前任务集合）
  - `ids: number[]`（必填）
  - `completed?: boolean`
  - `project?: string`
  - `dueDate?: YYYY-MM-DD | null`
  - 响应包含 `count` 与 `skipped`（例如批量完成时会跳过仍有未完成子任务的父任务）
- `PATCH /api/todos/:id`（编辑任务标题/项目/日期/父任务）
- `DELETE /api/todos/:id`（删除任务，含其子任务）
- `DELETE /api/todos/completed`（清理全部已完成任务）
- `PATCH /api/todos/:id/toggle`
