const path = require("path");
const express = require("express");
const {
  listTodos,
  createTodo,
  getTodo,
  toggleTodo,
  getStats,
  listParentCandidates,
  listProjects,
  dbFile,
} = require("./db");

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

app.get("/api/todos/meta", (_req, res) => {
  return res.json({
    projects: listProjects(),
    parents: listParentCandidates(),
  });
});

function isValidDateString(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

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

  const project = String(req.body?.project || "").trim() || "默认项目";
  if (project.length > 80) {
    return res.status(400).json({
      error: "project cannot exceed 80 characters",
    });
  }

  const dueDateRaw = String(req.body?.dueDate || "").trim();
  if (dueDateRaw && !isValidDateString(dueDateRaw)) {
    return res.status(400).json({
      error: "dueDate must be a valid date in YYYY-MM-DD format",
    });
  }

  let parentId = null;
  if (req.body?.parentId !== undefined && req.body?.parentId !== null && req.body?.parentId !== "") {
    parentId = Number(req.body.parentId);
    if (!Number.isInteger(parentId) || parentId <= 0) {
      return res.status(400).json({
        error: "parentId must be a positive integer",
      });
    }

    const parentTodo = getTodo(parentId);
    if (!parentTodo) {
      return res.status(400).json({
        error: "parentId does not exist",
      });
    }
  }

  const todo = createTodo({
    title,
    project,
    dueDate: dueDateRaw || null,
    parentId,
  });
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
