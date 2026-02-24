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
    completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TEXT
  );
`);

const listTodosQuery = db.prepare(`
  SELECT id, title, completed, created_at, completed_at
  FROM todos
  WHERE
    @filter = 'all'
    OR (@filter = 'active' AND completed = 0)
    OR (@filter = 'completed' AND completed = 1)
  ORDER BY completed ASC, id DESC
`);

const createTodoQuery = db.prepare(`
  INSERT INTO todos (title)
  VALUES (@title)
`);

const getTodoByIdQuery = db.prepare(`
  SELECT id, title, completed, created_at, completed_at
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

function mapTodo(row) {
  return {
    ...row,
    completed: Boolean(row.completed),
  };
}

function listTodos(filter = "all") {
  return listTodosQuery.all({ filter }).map(mapTodo);
}

function createTodo(rawTitle) {
  const title = String(rawTitle || "").trim();
  const result = createTodoQuery.run({ title });
  return getTodo(result.lastInsertRowid);
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

module.exports = {
  dbFile,
  listTodos,
  createTodo,
  getTodo,
  toggleTodo,
  getStats,
};
