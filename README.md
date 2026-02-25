# Todo Harbor

一个支持历史记录与完成状态持久化的待办事项网站。  
技术架构：`Node.js + Express + SQLite + Docker + cloudflared`。

## 功能

- 新增待办事项
- 切换完成/未完成状态
- 按 `全部 / 进行中 / 已完成` 过滤
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

## Docker 部署（推荐）

```bash
docker compose up -d --build
```

- 本机访问地址：`http://127.0.0.1:18080`
- 数据持久化目录：`./data`（映射到容器内 `/app/data`）

停止服务：

```bash
docker compose down
```

## 公网访问（cloudflared quick tunnel）

`docker-compose.yml` 已内置 `cloudflared` 服务，会自动创建 quick tunnel。  
查看公网地址：

```bash
docker compose logs cloudflared
```

日志里会出现：

```text
https://xxxxx.trycloudflare.com
```

## 已实现 API

- `GET /api/health`
- `GET /api/todos?filter=all|active|completed`
- `POST /api/todos`（body: `{ "title": "..." }`）
- `PATCH /api/todos/:id/toggle`
