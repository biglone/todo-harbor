const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "data");
const dbFile = process.env.DB_FILE || path.join(dataDir, "todos.db");

fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(dbFile);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS todos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL CHECK (length(trim(title)) > 0),
    project TEXT NOT NULL DEFAULT '默认项目',
    due_date TEXT,
    parent_id INTEGER,
    completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TEXT
  );
`);

const tableColumns = new Set(
  db
    .prepare(`PRAGMA table_info(todos)`)
    .all()
    .map((column) => column.name),
);

if (!tableColumns.has("project")) {
  db.exec(`ALTER TABLE todos ADD COLUMN project TEXT NOT NULL DEFAULT '默认项目';`);
}

if (!tableColumns.has("due_date")) {
  db.exec(`ALTER TABLE todos ADD COLUMN due_date TEXT;`);
}

if (!tableColumns.has("parent_id")) {
  db.exec(`ALTER TABLE todos ADD COLUMN parent_id INTEGER;`);
}

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_todos_completed ON todos (completed);
  CREATE INDEX IF NOT EXISTS idx_todos_project ON todos (project);
  CREATE INDEX IF NOT EXISTS idx_todos_due_date ON todos (due_date);
  CREATE INDEX IF NOT EXISTS idx_todos_parent_id ON todos (parent_id);
`);

const listTodosQuery = db.prepare(`
  SELECT id, title, project, due_date, parent_id, completed, created_at, completed_at
  FROM todos
  WHERE
    (
      @filter = 'all'
      OR (@filter = 'active' AND completed = 0)
      OR (@filter = 'completed' AND completed = 1)
    )
    AND (@project = '' OR project = @project)
    AND (
      @keyword = ''
      OR title LIKE '%' || @keyword || '%'
      OR project LIKE '%' || @keyword || '%'
    )
    AND (@due_from = '' OR (due_date IS NOT NULL AND due_date >= @due_from))
    AND (@due_to = '' OR (due_date IS NOT NULL AND due_date <= @due_to))
  ORDER BY id DESC
`);

const createTodoQuery = db.prepare(`
  INSERT INTO todos (title, project, due_date, parent_id)
  VALUES (@title, @project, @due_date, @parent_id)
`);

const updateTodoQuery = db.prepare(`
  UPDATE todos
  SET
    title = @title,
    project = @project,
    due_date = @due_date,
    parent_id = @parent_id
  WHERE id = @id
`);

const getTodoByIdQuery = db.prepare(`
  SELECT id, title, project, due_date, parent_id, completed, created_at, completed_at
  FROM todos
  WHERE id = @id
`);

const updateTodoStatusQuery = db.prepare(`
  UPDATE todos
  SET
    completed = @completed,
    completed_at = @completed_at
  WHERE id = @id
`);

const listTodoTreeIdsQuery = db.prepare(`
  WITH RECURSIVE tree(id) AS (
    SELECT id FROM todos WHERE id = @id
    UNION ALL
    SELECT child.id
    FROM todos AS child
    JOIN tree ON child.parent_id = tree.id
  )
  SELECT id FROM tree
`);

const deleteTodoByIdQuery = db.prepare(`
  DELETE FROM todos
  WHERE id = @id
`);

const deleteCompletedTodosQuery = db.prepare(`
  DELETE FROM todos
  WHERE completed = 1
`);

const clearOrphanParentsQuery = db.prepare(`
  UPDATE todos
  SET parent_id = NULL
  WHERE
    parent_id IS NOT NULL
    AND parent_id NOT IN (SELECT id FROM todos)
`);

const countTodosQuery = db.prepare(`
  SELECT
    COUNT(*) AS total,
    SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END) AS completed,
    SUM(CASE WHEN completed = 0 THEN 1 ELSE 0 END) AS active
  FROM todos
`);

const listParentCandidatesQuery = db.prepare(`
  SELECT id, title, project, due_date, parent_id, completed, created_at, completed_at
  FROM todos
  WHERE completed = 0
  ORDER BY id DESC
`);

const listProjectsQuery = db.prepare(`
  SELECT project, COUNT(*) AS count
  FROM todos
  GROUP BY project
  ORDER BY LOWER(project) ASC
`);

function mapTodo(row) {
  return {
    ...row,
    completed: Boolean(row.completed),
  };
}

function compareDueDate(a, b) {
  const hasDueA = Boolean(a.due_date);
  const hasDueB = Boolean(b.due_date);

  if (!hasDueA && !hasDueB) {
    return 0;
  }

  if (!hasDueA) {
    return 1;
  }

  if (!hasDueB) {
    return -1;
  }

  return a.due_date.localeCompare(b.due_date);
}

function sortTodos(items, sort) {
  const sorted = [...items];
  switch (sort) {
    case "created_asc":
      sorted.sort((a, b) => a.id - b.id);
      return sorted;
    case "due_asc":
      sorted.sort((a, b) => {
        const dueCompare = compareDueDate(a, b);
        if (dueCompare !== 0) {
          return dueCompare;
        }
        return b.id - a.id;
      });
      return sorted;
    case "due_desc":
      sorted.sort((a, b) => {
        const dueCompare = compareDueDate(a, b);
        if (dueCompare !== 0) {
          return -dueCompare;
        }
        return b.id - a.id;
      });
      return sorted;
    default:
      sorted.sort((a, b) => b.id - a.id);
      return sorted;
  }
}

function listTodos(options = "all") {
  const normalizedOptions =
    typeof options === "string"
      ? {
          filter: options,
          project: "",
          keyword: "",
          due_from: "",
          due_to: "",
          sort: "created_desc",
        }
      : {
          filter: String(options.filter || "all"),
          project: String(options.project || "").trim(),
          keyword: String(options.keyword || "").trim(),
          due_from: String(options.dueFrom || "").trim(),
          due_to: String(options.dueTo || "").trim(),
          sort: String(options.sort || "created_desc").trim(),
        };

  const rows = listTodosQuery.all(normalizedOptions).map(mapTodo);
  return sortTodos(rows, normalizedOptions.sort);
}

function normalizeTodoPayload({ title: rawTitle, project: rawProject, dueDate: rawDueDate, parentId }) {
  const title = String(rawTitle || "").trim();
  const project = String(rawProject || "").trim() || "默认项目";
  const dueDate = rawDueDate ? String(rawDueDate).trim() : null;
  const parentIdValue = Number.isInteger(parentId) && parentId > 0 ? parentId : null;

  return {
    title,
    project,
    due_date: dueDate || null,
    parent_id: parentIdValue,
  };
}

function insertTodo(payload) {
  const result = createTodoQuery.run(payload);
  return getTodo(result.lastInsertRowid);
}

function createTodo(payload) {
  return insertTodo(normalizeTodoPayload(payload));
}

function createTodosBulk(items) {
  const createMany = db.transaction((rows) => {
    const created = [];
    for (const row of rows) {
      created.push(insertTodo(normalizeTodoPayload(row)));
    }
    return created;
  });

  return createMany(items);
}

function updateTodo(id, payload) {
  const normalized = normalizeTodoPayload(payload);
  updateTodoQuery.run({
    id,
    ...normalized,
  });
  return getTodo(id);
}

function getTodo(id) {
  const todo = getTodoByIdQuery.get({ id });
  return todo ? mapTodo(todo) : null;
}

function toggleTodo(id) {
  const existing = getTodo(id);
  if (!existing) {
    return null;
  }

  const nextCompleted = !existing.completed;
  updateTodoStatusQuery.run({
    id,
    completed: Number(nextCompleted),
    completed_at: nextCompleted ? new Date().toISOString() : null,
  });

  return getTodo(id);
}

function deleteTodoTree(id) {
  const ids = listTodoTreeIdsQuery
    .all({ id })
    .map((row) => Number(row.id))
    .filter((todoId) => Number.isInteger(todoId) && todoId > 0);

  if (!ids.length) {
    return {
      count: 0,
      ids: [],
    };
  }

  const removeTree = db.transaction((targetIds) => {
    for (const targetId of targetIds) {
      deleteTodoByIdQuery.run({ id: targetId });
    }
    clearOrphanParentsQuery.run();
  });

  removeTree(ids);
  return {
    count: ids.length,
    ids,
  };
}

function clearCompletedTodos() {
  const clearCompleted = db.transaction(() => {
    const deleted = deleteCompletedTodosQuery.run();
    clearOrphanParentsQuery.run();
    return Number(deleted.changes || 0);
  });

  return clearCompleted();
}

function getStats() {
  const row = countTodosQuery.get();
  return {
    total: Number(row.total || 0),
    completed: Number(row.completed || 0),
    active: Number(row.active || 0),
  };
}

function listParentCandidates() {
  return listParentCandidatesQuery.all().map(mapTodo);
}

function listProjects() {
  return listProjectsQuery.all().map((row) => ({
    name: row.project,
    count: Number(row.count || 0),
  }));
}

module.exports = {
  dbFile,
  listTodos,
  createTodo,
  createTodosBulk,
  updateTodo,
  getTodo,
  toggleTodo,
  deleteTodoTree,
  clearCompletedTodos,
  getStats,
  listParentCandidates,
  listProjects,
};
