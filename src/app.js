const path = require("path");
const express = require("express");
const { listTodos, createTodo, toggleTodo, getStats, dbFile } = require("./db");

const VALID_FILTERS = new Set(["all", "active", "completed"]);
const app = express();

app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    dbFile,
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/todos", (req, res) => {
  const filter = String(req.query.filter || "all");
  if (!VALID_FILTERS.has(filter)) {
    return res.status(400).json({
      error: "Invalid filter. Allowed values: all, active, completed",
    });
  }

  return res.json({
    filter,
    stats: getStats(),
    items: listTodos(filter),
  });
});

app.post("/api/todos", (req, res) => {
  const title = String(req.body?.title || "").trim();
  if (!title) {
    return res.status(400).json({
      error: "title is required",
    });
  }

  if (title.length > 200) {
    return res.status(400).json({
      error: "title cannot exceed 200 characters",
    });
  }

  const todo = createTodo(title);
  return res.status(201).json(todo);
});

app.patch("/api/todos/:id/toggle", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({
      error: "id must be a positive integer",
    });
  }

  const todo = toggleTodo(id);
  if (!todo) {
    return res.status(404).json({
      error: "Todo not found",
    });
  }

  return res.json(todo);
});

app.use(express.static(path.join(__dirname, "..", "public")));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({
    error: "Internal Server Error",
  });
});

module.exports = app;
