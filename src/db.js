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
    @filter = 'all'
    OR (@filter = 'active' AND completed = 0)
    OR (@filter = 'completed' AND completed = 1)
  ORDER BY completed ASC, id DESC
`);

const createTodoQuery = db.prepare(`
  INSERT INTO todos (title, project, due_date, parent_id)
  VALUES (@title, @project, @due_date, @parent_id)
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

function listTodos(filter = "all") {
  return listTodosQuery.all({ filter }).map(mapTodo);
}

function normalizeCreatePayload({ title: rawTitle, project: rawProject, dueDate: rawDueDate, parentId }) {
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
  return insertTodo(normalizeCreatePayload(payload));
}

function createTodosBulk(items) {
  const createMany = db.transaction((rows) => {
    const created = [];
    for (const row of rows) {
      created.push(insertTodo(normalizeCreatePayload(row)));
    }
    return created;
  });

  return createMany(items);
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
  getTodo,
  toggleTodo,
  getStats,
  listParentCandidates,
  listProjects,
};
