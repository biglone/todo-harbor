const path = require("path");
const express = require("express");
const {
  listTodos,
  createTodo,
  createTodosBulk,
  updateTodo,
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

function parseTodoInput(body, { titleRequired = true } = {}) {
  const title = String(body?.title || "").trim();
  if (titleRequired && !title) {
    return { error: "title is required" };
  }

  if (title && title.length > 200) {
    return { error: "title cannot exceed 200 characters" };
  }

  const project = String(body?.project || "").trim() || "默认项目";
  if (project.length > 80) {
    return { error: "project cannot exceed 80 characters" };
  }

  const dueDateRaw = String(body?.dueDate || "").trim();
  if (dueDateRaw && !isValidDateString(dueDateRaw)) {
    return { error: "dueDate must be a valid date in YYYY-MM-DD format" };
  }

  let parentId = null;
  if (body?.parentId !== undefined && body?.parentId !== null && body?.parentId !== "") {
    parentId = Number(body.parentId);
    if (!Number.isInteger(parentId) || parentId <= 0) {
      return { error: "parentId must be a positive integer" };
    }

    const parentTodo = getTodo(parentId);
    if (!parentTodo) {
      return { error: "parentId does not exist" };
    }
  }

  return {
    value: {
      title,
      project,
      dueDate: dueDateRaw || null,
      parentId,
    },
  };
}

function hasParentLoop(todoId, nextParentId) {
  if (!nextParentId) {
    return false;
  }

  const visited = new Set([todoId]);
  let currentId = nextParentId;

  while (currentId) {
    if (visited.has(currentId)) {
      return true;
    }

    visited.add(currentId);
    const current = getTodo(currentId);
    if (!current || !current.parent_id) {
      return false;
    }

    currentId = current.parent_id;
  }

  return false;
}

function parseTodoUpdateInput(body, existingTodo) {
  const normalized = {
    title: body?.title ?? existingTodo.title,
    project: body?.project ?? existingTodo.project,
    dueDate: body?.dueDate !== undefined ? body?.dueDate : existingTodo.due_date,
    parentId: body?.parentId !== undefined ? body?.parentId : existingTodo.parent_id,
  };

  const parsed = parseTodoInput(normalized);
  if (parsed.error) {
    return parsed;
  }

  if (parsed.value.parentId === existingTodo.id) {
    return {
      error: "parentId cannot be self",
    };
  }

  if (hasParentLoop(existingTodo.id, parsed.value.parentId)) {
    return {
      error: "parentId would create a cycle",
    };
  }

  return parsed;
}

app.post("/api/todos", (req, res) => {
  const parsed = parseTodoInput(req.body);
  if (parsed.error) {
    return res.status(400).json({
      error: parsed.error,
    });
  }

  const todo = createTodo(parsed.value);
  return res.status(201).json(todo);
});

app.post("/api/todos/bulk", (req, res) => {
  const rawTitles = Array.isArray(req.body?.titles) ? req.body.titles : [];
  if (!rawTitles.length) {
    return res.status(400).json({
      error: "titles is required and must be a non-empty array",
    });
  }

  if (rawTitles.length > 50) {
    return res.status(400).json({
      error: "titles cannot exceed 50 items per request",
    });
  }

  const baseParsed = parseTodoInput(
    {
      ...req.body,
      title: "placeholder",
    },
    { titleRequired: false },
  );

  if (baseParsed.error) {
    return res.status(400).json({
      error: baseParsed.error,
    });
  }

  const items = [];
  for (const rawTitle of rawTitles) {
    const title = String(rawTitle || "").trim();
    if (!title) {
      continue;
    }

    if (title.length > 200) {
      return res.status(400).json({
        error: "Each title cannot exceed 200 characters",
      });
    }

    items.push({
      title,
      project: baseParsed.value.project,
      dueDate: baseParsed.value.dueDate,
      parentId: baseParsed.value.parentId,
    });
  }

  if (!items.length) {
    return res.status(400).json({
      error: "No valid titles provided after trimming",
    });
  }

  const created = createTodosBulk(items);
  return res.status(201).json({
    count: created.length,
    items: created,
  });
});

app.patch("/api/todos/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({
      error: "id must be a positive integer",
    });
  }

  const existingTodo = getTodo(id);
  if (!existingTodo) {
    return res.status(404).json({
      error: "Todo not found",
    });
  }

  const parsed = parseTodoUpdateInput(req.body, existingTodo);
  if (parsed.error) {
    return res.status(400).json({
      error: parsed.error,
    });
  }

  const todo = updateTodo(id, parsed.value);
  return res.json(todo);
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
