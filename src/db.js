const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "data");
const dbFile = process.env.DB_FILE || path.join(dataDir, "todos.db");

fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(dbFile);
db.pragma("journal_mode = WAL");

const TODO_PRIORITY_VALUES = new Set(["low", "medium", "high"]);
const TODO_STATUS_VALUES = new Set(["todo", "in_progress", "blocked"]);
const TODO_RECURRENCE_VALUES = new Set(["none", "daily", "weekly", "monthly"]);
const POMODORO_STATUS_VALUES = new Set(["running", "completed", "cancelled"]);
const DEFAULT_TODO_PRIORITY = "medium";
const DEFAULT_TODO_STATUS = "todo";
const DEFAULT_TODO_RECURRENCE = "none";
const UNDO_HISTORY_LIMIT = Number(process.env.UNDO_HISTORY_LIMIT || 20);

const listFilterWhereClause = `
  user_id = @user_id
  AND (
    @filter = 'all'
    OR (@filter = 'active' AND completed = 0)
    OR (@filter = 'completed' AND completed = 1)
  )
  AND (@project = '' OR project = @project)
  AND (
    @keyword = ''
    OR title LIKE '%' || @keyword || '%'
    OR project LIKE '%' || @keyword || '%'
    OR tags LIKE '%' || @keyword || '%'
  )
  AND (@priority = '' OR priority = @priority)
  AND (@status = '' OR status = @status)
  AND (@due_from = '' OR (due_date IS NOT NULL AND due_date >= @due_from))
  AND (@due_to = '' OR (due_date IS NOT NULL AND due_date <= @due_to))
`;

const listFilterWhereWithScopeClause = `
  ${listFilterWhereClause}
  AND (
    @due_scope = 'all'
    OR (@due_scope = 'overdue' AND due_date IS NOT NULL AND due_date < @today)
    OR (@due_scope = 'today' AND due_date = @today)
    OR (@due_scope = 'week' AND due_date IS NOT NULL AND due_date >= @today AND due_date <= @week_end)
    OR (@due_scope = 'no_due' AND due_date IS NULL)
  )
`;

const createTablesSQL = `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    email_verified INTEGER NOT NULL DEFAULT 0,
    verify_token_hash TEXT,
    verify_token_expires TEXT,
    reset_token_hash TEXT,
    reset_token_expires TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS registration_codes (
    email TEXT PRIMARY KEY,
    code_hash TEXT NOT NULL,
    code_expires TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS todos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    title TEXT NOT NULL CHECK (length(trim(title)) > 0),
    project TEXT NOT NULL DEFAULT '默认项目',
    due_date TEXT,
    reminder_at TEXT,
    parent_id INTEGER,
    priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
    status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'blocked')),
    recurrence TEXT NOT NULL DEFAULT 'none' CHECK (recurrence IN ('none', 'daily', 'weekly', 'monthly')),
    tags TEXT NOT NULL DEFAULT '[]',
    completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS undo_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS integration_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    source TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    token_hint TEXT NOT NULL,
    last_used_at TEXT,
    revoked_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS integration_todo_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    source TEXT NOT NULL,
    external_id TEXT NOT NULL,
    todo_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, source, external_id)
  );

  CREATE TABLE IF NOT EXISTS pomodoro_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    todo_id INTEGER NOT NULL,
    planned_minutes INTEGER NOT NULL DEFAULT 25,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'cancelled')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`;

db.exec(createTablesSQL);

const userColumns = new Set(
  db
    .prepare(`PRAGMA table_info(users)`)
    .all()
    .map((column) => column.name),
);

if (!userColumns.has("email_verified")) {
  db.exec(`ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0;`);
}

if (!userColumns.has("verify_token_hash")) {
  db.exec(`ALTER TABLE users ADD COLUMN verify_token_hash TEXT;`);
}

if (!userColumns.has("verify_token_expires")) {
  db.exec(`ALTER TABLE users ADD COLUMN verify_token_expires TEXT;`);
}

if (!userColumns.has("reset_token_hash")) {
  db.exec(`ALTER TABLE users ADD COLUMN reset_token_hash TEXT;`);
}

if (!userColumns.has("reset_token_expires")) {
  db.exec(`ALTER TABLE users ADD COLUMN reset_token_expires TEXT;`);
}

const tableColumns = new Set(
  db
    .prepare(`PRAGMA table_info(todos)`)
    .all()
    .map((column) => column.name),
);

if (!tableColumns.has("user_id")) {
  db.exec(`ALTER TABLE todos ADD COLUMN user_id INTEGER;`);
}

if (!tableColumns.has("project")) {
  db.exec(`ALTER TABLE todos ADD COLUMN project TEXT NOT NULL DEFAULT '默认项目';`);
}

if (!tableColumns.has("due_date")) {
  db.exec(`ALTER TABLE todos ADD COLUMN due_date TEXT;`);
}

if (!tableColumns.has("reminder_at")) {
  db.exec(`ALTER TABLE todos ADD COLUMN reminder_at TEXT;`);
}

if (!tableColumns.has("parent_id")) {
  db.exec(`ALTER TABLE todos ADD COLUMN parent_id INTEGER;`);
}

if (!tableColumns.has("priority")) {
  db.exec(`ALTER TABLE todos ADD COLUMN priority TEXT NOT NULL DEFAULT 'medium';`);
}

if (!tableColumns.has("status")) {
  db.exec(`ALTER TABLE todos ADD COLUMN status TEXT NOT NULL DEFAULT 'todo';`);
}

if (!tableColumns.has("tags")) {
  db.exec(`ALTER TABLE todos ADD COLUMN tags TEXT NOT NULL DEFAULT '[]';`);
}

if (!tableColumns.has("recurrence")) {
  db.exec(`ALTER TABLE todos ADD COLUMN recurrence TEXT NOT NULL DEFAULT 'none';`);
}

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_todos_user_id ON todos (user_id);
  CREATE INDEX IF NOT EXISTS idx_todos_completed ON todos (completed);
  CREATE INDEX IF NOT EXISTS idx_todos_project ON todos (project);
  CREATE INDEX IF NOT EXISTS idx_todos_due_date ON todos (due_date);
  CREATE INDEX IF NOT EXISTS idx_todos_reminder_at ON todos (reminder_at);
  CREATE INDEX IF NOT EXISTS idx_todos_parent_id ON todos (parent_id);
  CREATE INDEX IF NOT EXISTS idx_todos_priority ON todos (priority);
  CREATE INDEX IF NOT EXISTS idx_todos_status ON todos (status);
  CREATE INDEX IF NOT EXISTS idx_todos_recurrence ON todos (recurrence);
  CREATE INDEX IF NOT EXISTS idx_undo_snapshots_user_id ON undo_snapshots (user_id);
  CREATE INDEX IF NOT EXISTS idx_users_verify_token_hash ON users (verify_token_hash);
  CREATE INDEX IF NOT EXISTS idx_users_reset_token_hash ON users (reset_token_hash);
  CREATE INDEX IF NOT EXISTS idx_integration_tokens_user_id ON integration_tokens (user_id);
  CREATE INDEX IF NOT EXISTS idx_integration_tokens_token_hash ON integration_tokens (token_hash);
  CREATE INDEX IF NOT EXISTS idx_integration_links_user_source ON integration_todo_links (user_id, source);
  CREATE INDEX IF NOT EXISTS idx_integration_links_todo_id ON integration_todo_links (todo_id);
  CREATE INDEX IF NOT EXISTS idx_pomodoro_sessions_user_id ON pomodoro_sessions (user_id);
  CREATE INDEX IF NOT EXISTS idx_pomodoro_sessions_user_todo_id ON pomodoro_sessions (user_id, todo_id);
  CREATE INDEX IF NOT EXISTS idx_pomodoro_sessions_user_status ON pomodoro_sessions (user_id, status);
  CREATE INDEX IF NOT EXISTS idx_pomodoro_sessions_started_at ON pomodoro_sessions (started_at);
`);

const createUserQuery = db.prepare(`
  INSERT INTO users (email, password_hash, email_verified)
  VALUES (@email, @password_hash, @email_verified)
`);

const getUserByEmailQuery = db.prepare(`
  SELECT id,
    email,
    password_hash,
    email_verified,
    verify_token_hash,
    verify_token_expires,
    reset_token_hash,
    reset_token_expires,
    created_at
  FROM users
  WHERE email = @email
`);

const getUserByIdQuery = db.prepare(`
  SELECT id, email, email_verified, created_at
  FROM users
  WHERE id = @id
`);

const getUserByVerifyTokenQuery = db.prepare(`
  SELECT id, email, email_verified, verify_token_hash, verify_token_expires, created_at
  FROM users
  WHERE verify_token_hash = @hash
`);

const getUserByResetTokenQuery = db.prepare(`
  SELECT id, email, reset_token_hash, reset_token_expires, created_at
  FROM users
  WHERE reset_token_hash = @hash
`);

const setVerificationTokenQuery = db.prepare(`
  UPDATE users
  SET verify_token_hash = @hash,
      verify_token_expires = @expires
  WHERE id = @id
`);

const markEmailVerifiedQuery = db.prepare(`
  UPDATE users
  SET email_verified = 1,
      verify_token_hash = NULL,
      verify_token_expires = NULL
  WHERE id = @id
`);

const setResetTokenQuery = db.prepare(`
  UPDATE users
  SET reset_token_hash = @hash,
      reset_token_expires = @expires
  WHERE id = @id
`);

const upsertRegistrationCodeQuery = db.prepare(`
  INSERT INTO registration_codes (email, code_hash, code_expires, updated_at)
  VALUES (@email, @hash, @expires, CURRENT_TIMESTAMP)
  ON CONFLICT(email) DO UPDATE SET
    code_hash = excluded.code_hash,
    code_expires = excluded.code_expires,
    updated_at = CURRENT_TIMESTAMP
`);

const getRegistrationCodeByEmailQuery = db.prepare(`
  SELECT email, code_hash, code_expires, created_at, updated_at
  FROM registration_codes
  WHERE email = @email
`);

const clearRegistrationCodeByEmailQuery = db.prepare(`
  DELETE FROM registration_codes
  WHERE email = @email
`);

const clearResetTokenQuery = db.prepare(`
  UPDATE users
  SET reset_token_hash = NULL,
      reset_token_expires = NULL
  WHERE id = @id
`);

const updateUserEmailQuery = db.prepare(`
  UPDATE users
  SET email = @email,
      email_verified = 0,
      verify_token_hash = NULL,
      verify_token_expires = NULL
  WHERE id = @id
`);

const updateUserPasswordQuery = db.prepare(`
  UPDATE users
  SET password_hash = @password_hash
  WHERE id = @id
`);

const countUsersQuery = db.prepare(`
  SELECT COUNT(*) AS total
  FROM users
`);

const claimUnownedTodosQuery = db.prepare(`
  UPDATE todos
  SET user_id = @user_id
  WHERE user_id IS NULL
`);

const todoSelectColumns = `
  id, title, project, due_date, reminder_at, parent_id, priority, status, recurrence, tags, completed, created_at, completed_at
`;

const listTodosCreatedDescQuery = db.prepare(`
  SELECT ${todoSelectColumns}
  FROM todos
  WHERE ${listFilterWhereWithScopeClause}
  ORDER BY id DESC
  LIMIT @limit OFFSET @offset
`);

const listTodosCreatedAscQuery = db.prepare(`
  SELECT ${todoSelectColumns}
  FROM todos
  WHERE ${listFilterWhereWithScopeClause}
  ORDER BY id ASC
  LIMIT @limit OFFSET @offset
`);

const listTodosDueAscQuery = db.prepare(`
  SELECT ${todoSelectColumns}
  FROM todos
  WHERE ${listFilterWhereWithScopeClause}
  ORDER BY
    CASE WHEN due_date IS NULL THEN 1 ELSE 0 END ASC,
    due_date ASC,
    id DESC
  LIMIT @limit OFFSET @offset
`);

const listTodosDueDescQuery = db.prepare(`
  SELECT ${todoSelectColumns}
  FROM todos
  WHERE ${listFilterWhereWithScopeClause}
  ORDER BY
    CASE WHEN due_date IS NULL THEN 1 ELSE 0 END ASC,
    due_date DESC,
    id DESC
  LIMIT @limit OFFSET @offset
`);

const countFilteredTodosQuery = db.prepare(`
  SELECT COUNT(*) AS total
  FROM todos
  WHERE ${listFilterWhereWithScopeClause}
`);

const countDueSnapshotQuery = db.prepare(`
  SELECT
    SUM(CASE WHEN due_date IS NOT NULL AND due_date < @today THEN 1 ELSE 0 END) AS overdue,
    SUM(CASE WHEN due_date = @today THEN 1 ELSE 0 END) AS today,
    SUM(CASE WHEN due_date IS NOT NULL AND due_date > @today AND due_date <= @week_end THEN 1 ELSE 0 END) AS upcoming,
    SUM(CASE WHEN due_date IS NULL THEN 1 ELSE 0 END) AS no_due
  FROM todos
  WHERE ${listFilterWhereClause}
`);

const createTodoQuery = db.prepare(`
  INSERT INTO todos (user_id, title, project, due_date, reminder_at, parent_id, priority, status, recurrence, tags)
  VALUES (@user_id, @title, @project, @due_date, @reminder_at, @parent_id, @priority, @status, @recurrence, @tags)
`);

const updateTodoQuery = db.prepare(`
  UPDATE todos
  SET
    title = @title,
    project = @project,
    due_date = @due_date,
    reminder_at = @reminder_at,
    parent_id = @parent_id,
    priority = @priority,
    status = @status,
    recurrence = @recurrence,
    tags = @tags
  WHERE id = @id AND user_id = @user_id
`);

const getTodoByIdQuery = db.prepare(`
  SELECT ${todoSelectColumns}
  FROM todos
  WHERE id = @id AND user_id = @user_id
`);

const updateTodoStatusQuery = db.prepare(`
  UPDATE todos
  SET
    completed = @completed,
    completed_at = @completed_at
  WHERE id = @id AND user_id = @user_id
`);

const updateTodoProjectDueQuery = db.prepare(`
  UPDATE todos
  SET
    project = @project,
    due_date = @due_date,
    reminder_at = @reminder_at,
    priority = @priority,
    status = @status,
    recurrence = @recurrence,
    tags = @tags
  WHERE id = @id AND user_id = @user_id
`);

const listActiveChildIdsQuery = db.prepare(`
  SELECT id
  FROM todos
  WHERE parent_id = @id AND completed = 0 AND user_id = @user_id
`);

const listTodoTreeIdsQuery = db.prepare(`
  WITH RECURSIVE tree(id) AS (
    SELECT id FROM todos WHERE id = @id AND user_id = @user_id
    UNION ALL
    SELECT child.id
    FROM todos AS child
    JOIN tree ON child.parent_id = tree.id
    WHERE child.user_id = @user_id
  )
  SELECT id FROM tree
`);

const deleteTodoByIdQuery = db.prepare(`
  DELETE FROM todos
  WHERE id = @id AND user_id = @user_id
`);

const deleteCompletedTodosQuery = db.prepare(`
  DELETE FROM todos
  WHERE completed = 1 AND user_id = @user_id
`);

const deleteTodosByUserQuery = db.prepare(`
  DELETE FROM todos
  WHERE user_id = @user_id
`);

const clearOrphanParentsQuery = db.prepare(`
  UPDATE todos
  SET parent_id = NULL
  WHERE
    user_id = @user_id
    AND parent_id IS NOT NULL
    AND parent_id NOT IN (SELECT id FROM todos WHERE user_id = @user_id)
`);

const countTodosQuery = db.prepare(`
  SELECT
    COUNT(*) AS total,
    SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END) AS completed,
    SUM(CASE WHEN completed = 0 THEN 1 ELSE 0 END) AS active
  FROM todos
  WHERE user_id = @user_id
`);

const countCompletedTodosQuery = db.prepare(`
  SELECT COUNT(*) AS total
  FROM todos
  WHERE completed = 1 AND user_id = @user_id
`);

const listParentCandidatesQuery = db.prepare(`
  SELECT ${todoSelectColumns}
  FROM todos
  WHERE completed = 0 AND user_id = @user_id
  ORDER BY id DESC
`);

const listProjectsQuery = db.prepare(`
  SELECT project, COUNT(*) AS count
  FROM todos
  WHERE user_id = @user_id
  GROUP BY project
  ORDER BY LOWER(project) ASC
`);

const listTodosByUserRawQuery = db.prepare(`
  SELECT ${todoSelectColumns}
  FROM todos
  WHERE user_id = @user_id
  ORDER BY id ASC
`);

const insertTodoRawQuery = db.prepare(`
  INSERT INTO todos (
    id, user_id, title, project, due_date, reminder_at, parent_id, priority, status, recurrence, tags, completed, created_at, completed_at
  )
  VALUES (
    @id, @user_id, @title, @project, @due_date, @reminder_at, @parent_id, @priority, @status, @recurrence, @tags, @completed, @created_at, @completed_at
  )
`);

const insertImportedTodoQuery = db.prepare(`
  INSERT INTO todos (
    user_id, title, project, due_date, reminder_at, parent_id, priority, status, recurrence, tags, completed, created_at, completed_at
  )
  VALUES (
    @user_id, @title, @project, @due_date, @reminder_at, @parent_id, @priority, @status, @recurrence, @tags, @completed, @created_at, @completed_at
  )
`);

const updateImportedParentQuery = db.prepare(`
  UPDATE todos
  SET parent_id = @parent_id
  WHERE id = @id AND user_id = @user_id
`);

const insertUndoSnapshotQuery = db.prepare(`
  INSERT INTO undo_snapshots (user_id, payload)
  VALUES (@user_id, @payload)
`);

const pruneUndoSnapshotsQuery = db.prepare(`
  DELETE FROM undo_snapshots
  WHERE id IN (
    SELECT id
    FROM undo_snapshots
    WHERE user_id = @user_id
    ORDER BY id DESC
    LIMIT -1 OFFSET @keep
  )
`);

const countUndoSnapshotsQuery = db.prepare(`
  SELECT COUNT(*) AS total
  FROM undo_snapshots
  WHERE user_id = @user_id
`);

const getLatestUndoSnapshotQuery = db.prepare(`
  SELECT id, payload
  FROM undo_snapshots
  WHERE user_id = @user_id
  ORDER BY id DESC
  LIMIT 1
`);

const deleteUndoSnapshotByIdQuery = db.prepare(`
  DELETE FROM undo_snapshots
  WHERE id = @id AND user_id = @user_id
`);

const createIntegrationTokenQuery = db.prepare(`
  INSERT INTO integration_tokens (user_id, name, source, token_hash, token_hint)
  VALUES (@user_id, @name, @source, @token_hash, @token_hint)
`);

const listIntegrationTokensQuery = db.prepare(`
  SELECT id, name, source, token_hint, last_used_at, revoked_at, created_at
  FROM integration_tokens
  WHERE user_id = @user_id
  ORDER BY id DESC
`);

const getIntegrationTokenByIdQuery = db.prepare(`
  SELECT id, name, source, token_hint, last_used_at, revoked_at, created_at
  FROM integration_tokens
  WHERE id = @id
    AND user_id = @user_id
  LIMIT 1
`);

const getIntegrationTokenByHashQuery = db.prepare(`
  SELECT id, user_id, name, source, token_hint, last_used_at, revoked_at, created_at
  FROM integration_tokens
  WHERE token_hash = @token_hash
  LIMIT 1
`);

const touchIntegrationTokenQuery = db.prepare(`
  UPDATE integration_tokens
  SET last_used_at = @last_used_at
  WHERE id = @id
`);

const revokeIntegrationTokenQuery = db.prepare(`
  UPDATE integration_tokens
  SET revoked_at = @revoked_at
  WHERE id = @id AND user_id = @user_id AND revoked_at IS NULL
`);

const getIntegrationTodoLinkQuery = db.prepare(`
  SELECT todo_id
  FROM integration_todo_links
  WHERE user_id = @user_id
    AND source = @source
    AND external_id = @external_id
  LIMIT 1
`);

const upsertIntegrationTodoLinkQuery = db.prepare(`
  INSERT INTO integration_todo_links (user_id, source, external_id, todo_id, updated_at)
  VALUES (@user_id, @source, @external_id, @todo_id, CURRENT_TIMESTAMP)
  ON CONFLICT(user_id, source, external_id) DO UPDATE SET
    todo_id = excluded.todo_id,
    updated_at = CURRENT_TIMESTAMP
`);

const pomodoroSelectColumns = `
  id, todo_id, planned_minutes, started_at, ended_at, duration_seconds, status, created_at
`;

const createPomodoroSessionQuery = db.prepare(`
  INSERT INTO pomodoro_sessions (user_id, todo_id, planned_minutes, started_at, status)
  VALUES (@user_id, @todo_id, @planned_minutes, @started_at, 'running')
`);

const getPomodoroSessionByIdQuery = db.prepare(`
  SELECT ${pomodoroSelectColumns}
  FROM pomodoro_sessions
  WHERE id = @id
    AND user_id = @user_id
  LIMIT 1
`);

const getRunningPomodoroSessionQuery = db.prepare(`
  SELECT ${pomodoroSelectColumns}
  FROM pomodoro_sessions
  WHERE user_id = @user_id
    AND status = 'running'
  ORDER BY id DESC
  LIMIT 1
`);

const finishPomodoroSessionQuery = db.prepare(`
  UPDATE pomodoro_sessions
  SET ended_at = @ended_at,
      duration_seconds = @duration_seconds,
      status = @status
  WHERE id = @id
    AND user_id = @user_id
    AND status = 'running'
`);

const pomodoroFilterWhereClause = `
  ps.user_id = @user_id
  AND (@todo_id <= 0 OR ps.todo_id = @todo_id)
  AND (@from = '' OR ps.started_at >= @from)
  AND (@to = '' OR ps.started_at <= @to)
`;

const getPomodoroSummaryQuery = db.prepare(`
  SELECT
    COUNT(*) AS total_sessions,
    SUM(CASE WHEN ps.status = 'completed' THEN 1 ELSE 0 END) AS completed_sessions,
    SUM(CASE WHEN ps.status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled_sessions,
    SUM(ps.duration_seconds) AS total_seconds,
    SUM(CASE WHEN ps.status = 'completed' THEN ps.duration_seconds ELSE 0 END) AS completed_seconds
  FROM pomodoro_sessions AS ps
  WHERE ${pomodoroFilterWhereClause}
`);

const listPomodoroByTodoQuery = db.prepare(`
  SELECT
    ps.todo_id AS todo_id,
    COALESCE(t.title, '[已删除任务]') AS title,
    COALESCE(t.project, '默认项目') AS project,
    COUNT(*) AS total_sessions,
    SUM(CASE WHEN ps.status = 'completed' THEN 1 ELSE 0 END) AS completed_sessions,
    SUM(ps.duration_seconds) AS total_seconds,
    SUM(CASE WHEN ps.status = 'completed' THEN ps.duration_seconds ELSE 0 END) AS completed_seconds,
    MAX(ps.started_at) AS last_started_at
  FROM pomodoro_sessions AS ps
  LEFT JOIN todos AS t
    ON t.id = ps.todo_id
    AND t.user_id = ps.user_id
  WHERE ${pomodoroFilterWhereClause}
  GROUP BY ps.todo_id
  ORDER BY total_seconds DESC, ps.todo_id DESC
  LIMIT @limit
`);

const listPomodoroRecentSessionsQuery = db.prepare(`
  SELECT ${pomodoroSelectColumns}
  FROM pomodoro_sessions AS ps
  WHERE ${pomodoroFilterWhereClause}
  ORDER BY ps.id DESC
  LIMIT @limit
`);

function mapTodo(row) {
  const priority = normalizeTodoPriority(row.priority);
  const status = normalizeTodoStatus(row.status);
  const recurrence = normalizeTodoRecurrence(row.recurrence);
  const tags = parseTodoTags(row.tags);
  return {
    ...row,
    priority,
    status,
    recurrence,
    tags,
    completed: Boolean(row.completed),
  };
}

function mapRawTodo(row) {
  const priority = normalizeTodoPriority(row.priority);
  const status = normalizeTodoStatus(row.status);
  const recurrence = normalizeTodoRecurrence(row.recurrence);
  const tags = stringifyTodoTags(parseTodoTags(row.tags));
  return {
    ...row,
    priority,
    status,
    recurrence,
    tags,
    completed: Number(row.completed || 0),
  };
}

function mapPomodoroSession(row) {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    todoId: Number(row.todo_id),
    plannedMinutes: Number(row.planned_minutes || 25),
    startedAt: String(row.started_at || ""),
    endedAt: row.ended_at ? String(row.ended_at) : null,
    durationSeconds: Number(row.duration_seconds || 0),
    status: normalizePomodoroStatus(row.status, "running"),
    createdAt: String(row.created_at || ""),
  };
}

function normalizePomodoroStatus(rawStatus, fallback = "running") {
  const safeFallback = POMODORO_STATUS_VALUES.has(String(fallback || "").trim().toLowerCase())
    ? String(fallback).trim().toLowerCase()
    : "running";
  const value = String(rawStatus || safeFallback)
    .trim()
    .toLowerCase();
  return POMODORO_STATUS_VALUES.has(value) ? value : safeFallback;
}

function clampPomodoroMinutes(rawMinutes, fallback = 25) {
  const value = Number.parseInt(String(rawMinutes || fallback), 10);
  if (!Number.isInteger(value)) {
    return 25;
  }
  return Math.min(Math.max(value, 5), 180);
}

function clampPomodoroDurationSeconds(rawSeconds, fallback = 0) {
  const value = Number.parseInt(String(rawSeconds || fallback), 10);
  if (!Number.isInteger(value)) {
    return Math.max(0, Number.parseInt(String(fallback || 0), 10) || 0);
  }
  return Math.min(Math.max(value, 0), 24 * 60 * 60);
}

function normalizeTodoPriority(rawPriority) {
  const value = String(rawPriority || DEFAULT_TODO_PRIORITY).trim().toLowerCase();
  return TODO_PRIORITY_VALUES.has(value) ? value : DEFAULT_TODO_PRIORITY;
}

function normalizeOptionalTodoPriority(rawPriority) {
  const value = String(rawPriority || "").trim().toLowerCase();
  if (!value) {
    return "";
  }
  return TODO_PRIORITY_VALUES.has(value) ? value : "";
}

function normalizeTodoStatus(rawStatus) {
  const value = String(rawStatus || DEFAULT_TODO_STATUS).trim().toLowerCase();
  return TODO_STATUS_VALUES.has(value) ? value : DEFAULT_TODO_STATUS;
}

function normalizeOptionalTodoStatus(rawStatus) {
  const value = String(rawStatus || "").trim().toLowerCase();
  if (!value) {
    return "";
  }
  return TODO_STATUS_VALUES.has(value) ? value : "";
}

function normalizeTodoRecurrence(rawRecurrence) {
  const value = String(rawRecurrence || DEFAULT_TODO_RECURRENCE)
    .trim()
    .toLowerCase();
  return TODO_RECURRENCE_VALUES.has(value) ? value : DEFAULT_TODO_RECURRENCE;
}

function normalizeTodoTags(rawTags) {
  if (rawTags === null || rawTags === undefined) {
    return [];
  }

  let source = [];
  if (Array.isArray(rawTags)) {
    source = rawTags;
  } else if (typeof rawTags === "string") {
    const text = rawTags.trim();
    if (!text) {
      return [];
    }

    try {
      const parsed = JSON.parse(text);
      source = Array.isArray(parsed) ? parsed : text.split(",");
    } catch (_error) {
      source = text.split(",");
    }
  } else {
    source = [rawTags];
  }

  const deduped = [];
  const seen = new Set();
  for (const value of source) {
    const next = String(value || "")
      .trim()
      .replace(/^#/, "")
      .slice(0, 20);

    if (!next) {
      continue;
    }

    const key = next.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(next);
    if (deduped.length >= 20) {
      break;
    }
  }

  return deduped;
}

function parseTodoTags(rawTags) {
  return normalizeTodoTags(rawTags);
}

function stringifyTodoTags(tags) {
  return JSON.stringify(normalizeTodoTags(tags));
}

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

function isValidDateTimeString(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    return false;
  }

  const [datePart, timePart] = String(value).split("T");
  if (!isValidDateString(datePart)) {
    return false;
  }

  const [hours, minutes] = timePart.split(":").map(Number);
  return (
    Number.isInteger(hours) &&
    Number.isInteger(minutes) &&
    hours >= 0 &&
    hours <= 23 &&
    minutes >= 0 &&
    minutes <= 59
  );
}

function formatDateForInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateTimeForInput(date) {
  const datePart = formatDateForInput(date);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${datePart}T${hours}:${minutes}`;
}

function parseDateString(value) {
  const [year, month, day] = String(value || "")
    .split("-")
    .map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

function parseDateTimeString(value) {
  const [datePart, timePart] = String(value || "").split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hours, minutes] = timePart.split(":").map(Number);
  return new Date(year, month - 1, day, hours, minutes, 0, 0);
}

function getTodayDateString() {
  return formatDateForInput(new Date());
}

function getDateAfterDaysString(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return formatDateForInput(date);
}

function addDaysToDateString(dateString, days) {
  const [year, month, day] = String(dateString || "")
    .split("-")
    .map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return formatDateForInput(date);
}

function addMonthsToDateString(dateString, months) {
  const [year, month, day] = String(dateString || "")
    .split("-")
    .map(Number);

  const targetYearMonthDate = new Date(year, month - 1 + months, 1);
  const lastDay = new Date(targetYearMonthDate.getFullYear(), targetYearMonthDate.getMonth() + 1, 0).getDate();
  const targetDay = Math.min(day, lastDay);
  return formatDateForInput(new Date(targetYearMonthDate.getFullYear(), targetYearMonthDate.getMonth(), targetDay));
}

function getNextRecurringDueDate(dueDate, recurrence) {
  const normalizedRecurrence = normalizeTodoRecurrence(recurrence);
  if (!dueDate || !isValidDateString(dueDate) || normalizedRecurrence === "none") {
    return null;
  }

  if (normalizedRecurrence === "daily") {
    return addDaysToDateString(dueDate, 1);
  }

  if (normalizedRecurrence === "weekly") {
    return addDaysToDateString(dueDate, 7);
  }

  return addMonthsToDateString(dueDate, 1);
}

function getNextRecurringReminderAt(reminderAt, dueDate, nextDueDate) {
  if (
    !reminderAt ||
    !isValidDateTimeString(reminderAt) ||
    !dueDate ||
    !isValidDateString(dueDate) ||
    !nextDueDate ||
    !isValidDateString(nextDueDate)
  ) {
    return null;
  }

  const currentReminder = parseDateTimeString(reminderAt);
  const currentDue = parseDateString(dueDate);
  const nextDue = parseDateString(nextDueDate);

  const offsetMs = currentReminder.getTime() - currentDue.getTime();
  const nextReminder = new Date(nextDue.getTime() + offsetMs);
  return formatDateTimeForInput(nextReminder);
}

function requireUserId(rawUserId) {
  const userId = Number(rawUserId);
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new Error("userId is required");
  }
  return userId;
}

function normalizeListOptions(options = "all") {
  const defaults = {
    filter: "all",
    project: "",
    keyword: "",
    priority: "",
    status: "",
    dueFrom: "",
    dueTo: "",
    sort: "created_desc",
    dueScope: "all",
    page: 1,
    pageSize: 60,
    today: getTodayDateString(),
    weekEnd: getDateAfterDaysString(7),
  };

  const merged =
    typeof options === "string"
      ? { ...defaults, filter: options }
      : {
          ...defaults,
          ...options,
        };

  const pageNumber = Number.parseInt(String(merged.page), 10);
  const pageSizeNumber = Number.parseInt(String(merged.pageSize), 10);

  const normalizedPage = Number.isInteger(pageNumber) && pageNumber > 0 ? pageNumber : 1;
  const normalizedPageSize = Number.isInteger(pageSizeNumber)
    ? Math.min(Math.max(pageSizeNumber, 1), 200)
    : 60;

  return {
    user_id: requireUserId(merged.userId),
    filter: String(merged.filter || "all"),
    project: String(merged.project || "").trim(),
    keyword: String(merged.keyword || "").trim(),
    priority: normalizeOptionalTodoPriority(merged.priority),
    status: normalizeOptionalTodoStatus(merged.status),
    due_from: String(merged.dueFrom || "").trim(),
    due_to: String(merged.dueTo || "").trim(),
    sort: String(merged.sort || "created_desc"),
    due_scope: String(merged.dueScope || "all"),
    today: String(merged.today || getTodayDateString()),
    week_end: String(merged.weekEnd || getDateAfterDaysString(7)),
    limit: normalizedPageSize,
    offset: (normalizedPage - 1) * normalizedPageSize,
    page: normalizedPage,
    page_size: normalizedPageSize,
  };
}

function selectListQuery(sort) {
  switch (sort) {
    case "created_asc":
      return listTodosCreatedAscQuery;
    case "due_asc":
      return listTodosDueAscQuery;
    case "due_desc":
      return listTodosDueDescQuery;
    default:
      return listTodosCreatedDescQuery;
  }
}

function listTodos(options = "all") {
  const normalizedOptions = normalizeListOptions(options);
  const listQuery = selectListQuery(normalizedOptions.sort);

  const rows = listQuery.all(normalizedOptions).map(mapTodo);
  const countRow = countFilteredTodosQuery.get(normalizedOptions) || { total: 0 };
  const dueSnapshotRow = countDueSnapshotQuery.get(normalizedOptions) || {};

  const total = Number(countRow.total || 0);
  const totalPages = total > 0 ? Math.ceil(total / normalizedOptions.limit) : 0;
  const loaded = normalizedOptions.offset + rows.length;

  return {
    items: rows,
    pagination: {
      page: normalizedOptions.page,
      pageSize: normalizedOptions.limit,
      total,
      totalPages,
      hasNext: loaded < total,
    },
    dueSnapshot: {
      overdue: Number(dueSnapshotRow.overdue || 0),
      today: Number(dueSnapshotRow.today || 0),
      upcoming: Number(dueSnapshotRow.upcoming || 0),
      noDue: Number(dueSnapshotRow.no_due || 0),
    },
  };
}

function normalizeTodoPayload({
  title: rawTitle,
  project: rawProject,
  dueDate: rawDueDate,
  reminderAt: rawReminderAt,
  parentId,
  priority: rawPriority,
  status: rawStatus,
  recurrence: rawRecurrence,
  tags: rawTags,
  userId,
}) {
  const title = String(rawTitle || "").trim();
  const project = String(rawProject || "").trim() || "默认项目";
  const dueDate = rawDueDate ? String(rawDueDate).trim() : null;
  const reminderAt = rawReminderAt ? String(rawReminderAt).trim() : null;
  const parentIdValue = Number.isInteger(parentId) && parentId > 0 ? parentId : null;
  const priority = normalizeTodoPriority(rawPriority);
  const status = normalizeTodoStatus(rawStatus);
  const recurrence = normalizeTodoRecurrence(rawRecurrence);
  const normalizedReminderAt = reminderAt && isValidDateTimeString(reminderAt) ? reminderAt : null;
  const tags = stringifyTodoTags(rawTags);

  return {
    user_id: requireUserId(userId),
    title,
    project,
    due_date: dueDate || null,
    reminder_at: normalizedReminderAt,
    parent_id: parentIdValue,
    priority,
    status,
    recurrence,
    tags,
  };
}

function saveUndoSnapshot(userId) {
  const id = requireUserId(userId);
  const snapshotRows = listTodosByUserRawQuery.all({ user_id: id }).map(mapRawTodo);
  const saveSnapshot = db.transaction((rows) => {
    insertUndoSnapshotQuery.run({
      user_id: id,
      payload: JSON.stringify(rows),
    });

    pruneUndoSnapshotsQuery.run({
      user_id: id,
      keep: Math.max(1, UNDO_HISTORY_LIMIT),
    });
  });

  saveSnapshot(snapshotRows);
}

function hasUndoSnapshot(userId) {
  const id = requireUserId(userId);
  const row = countUndoSnapshotsQuery.get({ user_id: id }) || { total: 0 };
  return Number(row.total || 0) > 0;
}

function restoreSnapshot(userId, snapshotRows) {
  const id = requireUserId(userId);
  const restore = db.transaction((rows) => {
    deleteTodosByUserQuery.run({ user_id: id });

    for (const row of rows) {
      insertTodoRawQuery.run({
        id: Number(row.id),
        user_id: id,
        title: String(row.title),
        project: String(row.project || "默认项目"),
        due_date: row.due_date ? String(row.due_date) : null,
        reminder_at:
          row.reminder_at && isValidDateTimeString(String(row.reminder_at))
            ? String(row.reminder_at)
            : null,
        parent_id: Number.isInteger(row.parent_id) ? row.parent_id : null,
        priority: normalizeTodoPriority(row.priority),
        status: normalizeTodoStatus(row.status),
        recurrence: normalizeTodoRecurrence(row.recurrence),
        tags: stringifyTodoTags(row.tags),
        completed: Number(row.completed ? 1 : 0),
        created_at: String(row.created_at || new Date().toISOString()),
        completed_at: row.completed_at ? String(row.completed_at) : null,
      });
    }

    clearOrphanParentsQuery.run({ user_id: id });
  });

  restore(snapshotRows);
}

function undoLastOperation(userId) {
  const id = requireUserId(userId);
  const snapshotRow = getLatestUndoSnapshotQuery.get({ user_id: id });
  if (!snapshotRow) {
    return {
      restored: false,
      count: 0,
    };
  }

  let snapshot = [];
  try {
    const parsed = JSON.parse(String(snapshotRow.payload || "[]"));
    snapshot = Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    snapshot = [];
  }

  restoreSnapshot(id, snapshot);
  deleteUndoSnapshotByIdQuery.run({ id: snapshotRow.id, user_id: id });

  return {
    restored: true,
    count: snapshot.length,
  };
}

function insertTodo(payload) {
  const result = createTodoQuery.run(payload);
  return getTodo(payload.user_id, result.lastInsertRowid);
}

function createNextRecurringTodo(userId, sourceTodo) {
  const recurrence = normalizeTodoRecurrence(sourceTodo?.recurrence);
  if (recurrence === "none") {
    return null;
  }

  const nextDueDate = getNextRecurringDueDate(sourceTodo?.due_date, recurrence);
  if (!nextDueDate) {
    return null;
  }
  const nextReminderAt = getNextRecurringReminderAt(
    sourceTodo?.reminder_at,
    sourceTodo?.due_date,
    nextDueDate,
  );

  const parentId =
    Number.isInteger(sourceTodo?.parent_id) && sourceTodo.parent_id > 0
      ? Number(sourceTodo.parent_id)
      : null;
  const parent = parentId ? getTodo(userId, parentId) : null;
  const safeParentId = parent && !parent.completed ? parent.id : null;

  return insertTodo({
    user_id: requireUserId(userId),
    title: String(sourceTodo?.title || ""),
    project: String(sourceTodo?.project || "默认项目"),
    due_date: nextDueDate,
    reminder_at: nextReminderAt,
    parent_id: safeParentId,
    priority: normalizeTodoPriority(sourceTodo?.priority),
    status: "todo",
    recurrence,
    tags: stringifyTodoTags(sourceTodo?.tags),
  });
}

function createTodo(userId, payload) {
  saveUndoSnapshot(userId);
  return insertTodo(normalizeTodoPayload({ ...payload, userId }));
}

function createTodosBulk(userId, items) {
  saveUndoSnapshot(userId);
  const createMany = db.transaction((rows) => {
    const created = [];
    for (const row of rows) {
      created.push(insertTodo(normalizeTodoPayload({ ...row, userId })));
    }
    return created;
  });

  return createMany(items);
}

function updateTodo(userId, id, payload) {
  saveUndoSnapshot(userId);
  const normalized = normalizeTodoPayload({ ...payload, userId });
  updateTodoQuery.run({
    id,
    ...normalized,
  });
  return getTodo(userId, id);
}

function getTodo(userId, id) {
  const todo = getTodoByIdQuery.get({ id, user_id: requireUserId(userId) });
  return todo ? mapTodo(todo) : null;
}

function toggleTodo(userId, id) {
  const existing = getTodo(userId, id);
  if (!existing) {
    return null;
  }

  saveUndoSnapshot(userId);
  const nextCompleted = !existing.completed;
  updateTodoStatusQuery.run({
    id,
    user_id: requireUserId(userId),
    completed: Number(nextCompleted),
    completed_at: nextCompleted ? new Date().toISOString() : null,
  });

  if (nextCompleted && !existing.completed) {
    createNextRecurringTodo(userId, existing);
  }

  return getTodo(userId, id);
}

function hasActiveChildren(userId, id) {
  const rows = listActiveChildIdsQuery.all({ id, user_id: requireUserId(userId) });
  return rows.length > 0;
}

function deleteTodoTree(userId, id) {
  const userIdValue = requireUserId(userId);
  const ids = listTodoTreeIdsQuery
    .all({ id, user_id: userIdValue })
    .map((row) => Number(row.id))
    .filter((todoId) => Number.isInteger(todoId) && todoId > 0);

  if (!ids.length) {
    return {
      count: 0,
      ids: [],
    };
  }

  saveUndoSnapshot(userIdValue);
  const removeTree = db.transaction((targetIds) => {
    for (const targetId of targetIds) {
      deleteTodoByIdQuery.run({ id: targetId, user_id: userIdValue });
    }
    clearOrphanParentsQuery.run({ user_id: userIdValue });
  });

  removeTree(ids);
  return {
    count: ids.length,
    ids,
  };
}

function clearCompletedTodos(userId) {
  const userIdValue = requireUserId(userId);
  const row = countCompletedTodosQuery.get({ user_id: userIdValue }) || { total: 0 };
  if (Number(row.total || 0) <= 0) {
    return 0;
  }

  saveUndoSnapshot(userIdValue);
  const clearCompleted = db.transaction(() => {
    const deleted = deleteCompletedTodosQuery.run({ user_id: userIdValue });
    clearOrphanParentsQuery.run({ user_id: userIdValue });
    return Number(deleted.changes || 0);
  });

  return clearCompleted();
}

function updateTodosBatch(
  userId,
  { ids, project, dueDate, reminderAt, completed, priority, status, recurrence, tags },
) {
  const userIdValue = requireUserId(userId);
  const uniqueIds = [...new Set(ids)].filter((id) => Number.isInteger(id) && id > 0);
  if (!uniqueIds.length) {
    return {
      count: 0,
      ids: [],
    };
  }

  saveUndoSnapshot(userIdValue);
  const applyBatch = db.transaction((targetIds) => {
    const updatedIds = new Set();
    const completedAt = completed === true ? new Date().toISOString() : null;
    let completionEligibleIds = null;

    if (completed === true) {
      completionEligibleIds = new Set(targetIds);
      let changed = true;

      while (changed) {
        changed = false;
        for (const id of completionEligibleIds) {
          const activeChildIds = listActiveChildIdsQuery
            .all({ id, user_id: userIdValue })
            .map((row) => Number(row.id))
            .filter((childId) => Number.isInteger(childId) && childId > 0);

          const hasExternalActiveChild = activeChildIds.some((childId) => !completionEligibleIds.has(childId));
          if (hasExternalActiveChild) {
            completionEligibleIds.delete(id);
            changed = true;
          }
        }
      }
    }

    for (const id of targetIds) {
      const current = getTodo(userIdValue, id);
      if (!current) {
        continue;
      }

      if (
        project !== undefined ||
        dueDate !== undefined ||
        reminderAt !== undefined ||
        priority !== undefined ||
        status !== undefined ||
        recurrence !== undefined ||
        tags !== undefined
      ) {
        const nextProject = project !== undefined ? project : current.project;
        const nextDueDate = dueDate !== undefined ? dueDate : current.due_date;
        const nextReminderAt = reminderAt !== undefined ? reminderAt : current.reminder_at;
        const nextPriority = priority !== undefined ? priority : current.priority;
        const nextStatus = status !== undefined ? status : current.status;
        const nextRecurrence = recurrence !== undefined ? recurrence : current.recurrence;
        const nextTags = tags !== undefined ? tags : current.tags;
        const updateResult = updateTodoProjectDueQuery.run({
          id,
          user_id: userIdValue,
          project: nextProject,
          due_date: nextDueDate || null,
          reminder_at: nextReminderAt || null,
          priority: normalizeTodoPriority(nextPriority),
          status: normalizeTodoStatus(nextStatus),
          recurrence: normalizeTodoRecurrence(nextRecurrence),
          tags: stringifyTodoTags(nextTags),
        });

        if (updateResult.changes > 0) {
          updatedIds.add(id);
        }
      }

      if (completed !== undefined) {
        if (completed === true && completionEligibleIds && !completionEligibleIds.has(id)) {
          continue;
        }

        const updateResult = updateTodoStatusQuery.run({
          id,
          user_id: userIdValue,
          completed: Number(completed),
          completed_at: completed ? completedAt : null,
        });

        if (updateResult.changes > 0) {
          updatedIds.add(id);
        }

        if (completed === true && !current.completed) {
          createNextRecurringTodo(userIdValue, {
            ...current,
            project: project !== undefined ? project : current.project,
            due_date: dueDate !== undefined ? dueDate || null : current.due_date,
            reminder_at: reminderAt !== undefined ? reminderAt || null : current.reminder_at,
            priority: priority !== undefined ? priority : current.priority,
            recurrence: recurrence !== undefined ? recurrence : current.recurrence,
            tags: tags !== undefined ? tags : current.tags,
          });
        }
      }
    }

    return [...updatedIds];
  });

  const updatedIds = applyBatch(uniqueIds);
  return {
    count: updatedIds.length,
    ids: updatedIds,
  };
}

function normalizeImportItem(rawItem, index) {
  const title = String(rawItem?.title || "").trim();
  if (!title) {
    throw new Error(`items[${index}].title is required`);
  }
  if (title.length > 200) {
    throw new Error(`items[${index}].title cannot exceed 200 characters`);
  }

  const project = String(rawItem?.project || "").trim() || "默认项目";
  if (project.length > 80) {
    throw new Error(`items[${index}].project cannot exceed 80 characters`);
  }

  const dueDateRaw = rawItem?.due_date ?? rawItem?.dueDate ?? null;
  const dueDate = dueDateRaw === null || dueDateRaw === undefined ? null : String(dueDateRaw).trim() || null;
  if (dueDate && !isValidDateString(dueDate)) {
    throw new Error(`items[${index}].dueDate must be YYYY-MM-DD`);
  }

  const reminderAtRaw = rawItem?.reminder_at ?? rawItem?.reminderAt ?? null;
  const reminderAt =
    reminderAtRaw === null || reminderAtRaw === undefined ? null : String(reminderAtRaw).trim() || null;
  if (reminderAt && !isValidDateTimeString(reminderAt)) {
    throw new Error(`items[${index}].reminderAt must be YYYY-MM-DDTHH:mm`);
  }

  const priority = normalizeTodoPriority(rawItem?.priority);
  const status = normalizeTodoStatus(rawItem?.status);
  const recurrence = normalizeTodoRecurrence(rawItem?.recurrence);
  if (recurrence !== "none" && !dueDate) {
    throw new Error(`items[${index}].dueDate is required when recurrence is enabled`);
  }
  const tags = stringifyTodoTags(rawItem?.tags);

  const completed = Boolean(rawItem?.completed);
  const createdAt = String(rawItem?.created_at || rawItem?.createdAt || new Date().toISOString());
  const completedAt = completed
    ? String(rawItem?.completed_at || rawItem?.completedAt || new Date().toISOString())
    : null;

  const idRaw = Number(rawItem?.id);
  const parentRaw = Number(rawItem?.parent_id ?? rawItem?.parentId);

  return {
    sourceKey: Number.isInteger(idRaw) && idRaw > 0 ? `id:${idRaw}` : `idx:${index}`,
    parentKey: Number.isInteger(parentRaw) && parentRaw > 0 ? `id:${parentRaw}` : null,
    title,
    project,
    due_date: dueDate,
    reminder_at: reminderAt,
    priority,
    status,
    recurrence,
    tags,
    completed: Number(completed),
    created_at: createdAt,
    completed_at: completedAt,
  };
}

function importTodos(userId, { items, mode = "merge" }) {
  const userIdValue = requireUserId(userId);
  const normalizedMode = mode === "replace" ? "replace" : "merge";
  const normalizedItems = items.map((item, index) => normalizeImportItem(item, index));

  saveUndoSnapshot(userIdValue);
  const runImport = db.transaction((rows) => {
    if (normalizedMode === "replace") {
      deleteTodosByUserQuery.run({ user_id: userIdValue });
    }

    const keyToNewId = new Map();
    const importedRows = [];

    for (const row of rows) {
      const result = insertImportedTodoQuery.run({
        user_id: userIdValue,
        title: row.title,
        project: row.project,
        due_date: row.due_date,
        reminder_at: row.reminder_at,
        parent_id: null,
        priority: row.priority,
        status: row.status,
        recurrence: row.recurrence,
        tags: row.tags,
        completed: row.completed,
        created_at: row.created_at,
        completed_at: row.completed ? row.completed_at : null,
      });

      const newId = Number(result.lastInsertRowid);
      keyToNewId.set(row.sourceKey, newId);
      importedRows.push({ id: newId, parentKey: row.parentKey });
    }

    for (const row of importedRows) {
      if (!row.parentKey) {
        continue;
      }
      const parentId = keyToNewId.get(row.parentKey);
      if (!parentId || parentId === row.id) {
        continue;
      }
      updateImportedParentQuery.run({ id: row.id, parent_id: parentId, user_id: userIdValue });
    }

    clearOrphanParentsQuery.run({ user_id: userIdValue });
    return importedRows.length;
  });

  const count = runImport(normalizedItems);
  return {
    count,
    mode: normalizedMode,
  };
}

function exportTodos(userId) {
  const userIdValue = requireUserId(userId);
  return listTodosByUserRawQuery.all({ user_id: userIdValue }).map((row) => ({
    id: Number(row.id),
    title: String(row.title),
    project: String(row.project || "默认项目"),
    due_date: row.due_date ? String(row.due_date) : null,
    reminder_at: row.reminder_at ? String(row.reminder_at) : null,
    parent_id: Number.isInteger(row.parent_id) ? row.parent_id : null,
    priority: normalizeTodoPriority(row.priority),
    status: normalizeTodoStatus(row.status),
    recurrence: normalizeTodoRecurrence(row.recurrence),
    tags: parseTodoTags(row.tags),
    completed: Boolean(row.completed),
    created_at: String(row.created_at || ""),
    completed_at: row.completed_at ? String(row.completed_at) : null,
  }));
}

function getStats(userId) {
  const row = countTodosQuery.get({ user_id: requireUserId(userId) });
  return {
    total: Number(row.total || 0),
    completed: Number(row.completed || 0),
    active: Number(row.active || 0),
  };
}

function listParentCandidates(userId) {
  return listParentCandidatesQuery.all({ user_id: requireUserId(userId) }).map(mapTodo);
}

function listProjects(userId) {
  return listProjectsQuery.all({ user_id: requireUserId(userId) }).map((row) => ({
    name: row.project,
    count: Number(row.count || 0),
  }));
}

function createUser({ email, passwordHash, emailVerified = false }) {
  const result = createUserQuery.run({
    email,
    password_hash: passwordHash,
    email_verified: emailVerified ? 1 : 0,
  });
  return getUserById(result.lastInsertRowid);
}

function getUserByEmail(email) {
  return getUserByEmailQuery.get({ email }) || null;
}

function getUserById(id) {
  return getUserByIdQuery.get({ id }) || null;
}

function getUserByVerifyTokenHash(hash) {
  return getUserByVerifyTokenQuery.get({ hash }) || null;
}

function getUserByResetTokenHash(hash) {
  return getUserByResetTokenQuery.get({ hash }) || null;
}

function countUsers() {
  const row = countUsersQuery.get() || { total: 0 };
  return Number(row.total || 0);
}

function claimUnownedTodos(userId) {
  const userIdValue = requireUserId(userId);
  const result = claimUnownedTodosQuery.run({ user_id: userIdValue });
  return Number(result.changes || 0);
}

function setVerificationToken(userId, tokenHash, expiresAt) {
  const userIdValue = requireUserId(userId);
  setVerificationTokenQuery.run({
    id: userIdValue,
    hash: tokenHash,
    expires: expiresAt,
  });
}

function markEmailVerified(userId) {
  const userIdValue = requireUserId(userId);
  markEmailVerifiedQuery.run({ id: userIdValue });
}

function setResetToken(userId, tokenHash, expiresAt) {
  const userIdValue = requireUserId(userId);
  setResetTokenQuery.run({
    id: userIdValue,
    hash: tokenHash,
    expires: expiresAt,
  });
}

function setRegistrationCode(email, codeHash, expiresAt) {
  upsertRegistrationCodeQuery.run({
    email: String(email || ""),
    hash: String(codeHash || ""),
    expires: expiresAt,
  });
}

function getRegistrationCodeByEmail(email) {
  return getRegistrationCodeByEmailQuery.get({ email: String(email || "") }) || null;
}

function clearRegistrationCodeByEmail(email) {
  clearRegistrationCodeByEmailQuery.run({ email: String(email || "") });
}

function clearResetToken(userId) {
  const userIdValue = requireUserId(userId);
  clearResetTokenQuery.run({ id: userIdValue });
}

function updateUserEmail(userId, email) {
  const userIdValue = requireUserId(userId);
  updateUserEmailQuery.run({ id: userIdValue, email });
  return getUserById(userIdValue);
}

function updateUserPassword(userId, passwordHash) {
  const userIdValue = requireUserId(userId);
  updateUserPasswordQuery.run({ id: userIdValue, password_hash: passwordHash });
}

function mapIntegrationToken(row) {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    name: String(row.name || ""),
    source: String(row.source || ""),
    tokenHint: String(row.token_hint || ""),
    lastUsedAt: row.last_used_at ? String(row.last_used_at) : null,
    revokedAt: row.revoked_at ? String(row.revoked_at) : null,
    createdAt: String(row.created_at || ""),
  };
}

function createIntegrationToken(userId, { name, source, tokenHash, tokenHint }) {
  const userIdValue = requireUserId(userId);
  const result = createIntegrationTokenQuery.run({
    user_id: userIdValue,
    name: String(name || "").trim(),
    source: String(source || "").trim(),
    token_hash: String(tokenHash || ""),
    token_hint: String(tokenHint || ""),
  });

  return mapIntegrationToken(
    getIntegrationTokenByIdQuery.get({
      id: Number(result.lastInsertRowid),
      user_id: userIdValue,
    }),
  );
}

function listIntegrationTokens(userId) {
  return listIntegrationTokensQuery.all({ user_id: requireUserId(userId) }).map(mapIntegrationToken);
}

function getIntegrationTokenByHash(tokenHash) {
  const row = getIntegrationTokenByHashQuery.get({ token_hash: String(tokenHash || "") });
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    name: String(row.name || ""),
    source: String(row.source || ""),
    tokenHint: String(row.token_hint || ""),
    lastUsedAt: row.last_used_at ? String(row.last_used_at) : null,
    revokedAt: row.revoked_at ? String(row.revoked_at) : null,
    createdAt: String(row.created_at || ""),
  };
}

function touchIntegrationToken(tokenId) {
  const id = Number(tokenId);
  if (!Number.isInteger(id) || id <= 0) {
    return;
  }

  touchIntegrationTokenQuery.run({
    id,
    last_used_at: new Date().toISOString(),
  });
}

function revokeIntegrationToken(userId, tokenId) {
  const userIdValue = requireUserId(userId);
  const id = Number(tokenId);
  if (!Number.isInteger(id) || id <= 0) {
    return false;
  }

  const result = revokeIntegrationTokenQuery.run({
    id,
    user_id: userIdValue,
    revoked_at: new Date().toISOString(),
  });
  return Number(result.changes || 0) > 0;
}

function upsertTodosByIntegration(userId, { source, items }) {
  const userIdValue = requireUserId(userId);
  const normalizedSource = String(source || "").trim();

  saveUndoSnapshot(userIdValue);

  const runUpsert = db.transaction((rows) => {
    const results = [];
    let created = 0;
    let updated = 0;

    for (const row of rows) {
      const externalId = String(row.externalId || "").trim();
      const normalized = normalizeTodoPayload({ ...row, userId: userIdValue });
      let todo = null;
      let action = "created";

      if (externalId) {
        const link = getIntegrationTodoLinkQuery.get({
          user_id: userIdValue,
          source: normalizedSource,
          external_id: externalId,
        });

        const linkedTodoId = Number(link?.todo_id);
        if (Number.isInteger(linkedTodoId) && linkedTodoId > 0) {
          const existingTodo = getTodo(userIdValue, linkedTodoId);
          if (existingTodo) {
            updateTodoQuery.run({
              id: linkedTodoId,
              ...normalized,
            });
            todo = getTodo(userIdValue, linkedTodoId);
            action = "updated";
            updated += 1;
          }
        }
      }

      if (!todo) {
        todo = insertTodo(normalized);
        action = "created";
        created += 1;
      }

      if (externalId) {
        upsertIntegrationTodoLinkQuery.run({
          user_id: userIdValue,
          source: normalizedSource,
          external_id: externalId,
          todo_id: todo.id,
        });
      }

      results.push({
        action,
        externalId: externalId || null,
        todo,
      });
    }

    return {
      source: normalizedSource,
      count: results.length,
      created,
      updated,
      items: results,
    };
  });

  return runUpsert(items);
}

function normalizePomodoroFilterOptions(userId, options = {}) {
  const normalizedTodoId = Number.parseInt(String(options.todoId || 0), 10);
  const limit = Number.parseInt(String(options.limit || 20), 10);
  return {
    user_id: requireUserId(userId),
    todo_id: Number.isInteger(normalizedTodoId) && normalizedTodoId > 0 ? normalizedTodoId : 0,
    from: String(options.from || "").trim(),
    to: String(options.to || "").trim(),
    limit: Number.isInteger(limit) ? Math.min(Math.max(limit, 1), 200) : 20,
  };
}

function getPomodoroSession(userId, sessionId) {
  const id = Number.parseInt(String(sessionId || ""), 10);
  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }

  const row = getPomodoroSessionByIdQuery.get({
    id,
    user_id: requireUserId(userId),
  });
  return mapPomodoroSession(row);
}

function getRunningPomodoroSession(userId) {
  const row = getRunningPomodoroSessionQuery.get({ user_id: requireUserId(userId) });
  return mapPomodoroSession(row);
}

function createPomodoroSession(userId, { todoId, plannedMinutes = 25, startedAt } = {}) {
  const userIdValue = requireUserId(userId);
  const targetTodoId = Number.parseInt(String(todoId || ""), 10);

  if (!Number.isInteger(targetTodoId) || targetTodoId <= 0) {
    throw new Error("todoId must be a positive integer");
  }

  const todo = getTodo(userIdValue, targetTodoId);
  if (!todo) {
    throw new Error("todoId does not exist");
  }
  if (todo.completed) {
    throw new Error("Cannot start pomodoro on a completed todo");
  }

  const active = getRunningPomodoroSession(userIdValue);
  if (active) {
    throw new Error("Another pomodoro session is already running");
  }

  const parsedStartedAt = Date.parse(String(startedAt || ""));
  const startedAtValue = Number.isFinite(parsedStartedAt)
    ? new Date(parsedStartedAt).toISOString()
    : new Date().toISOString();

  const result = createPomodoroSessionQuery.run({
    user_id: userIdValue,
    todo_id: targetTodoId,
    planned_minutes: clampPomodoroMinutes(plannedMinutes, 25),
    started_at: startedAtValue,
  });

  return getPomodoroSession(userIdValue, Number(result.lastInsertRowid));
}

function finishPomodoroSession(userId, sessionId, { status = "completed", durationSeconds, endedAt } = {}) {
  const userIdValue = requireUserId(userId);
  const id = Number.parseInt(String(sessionId || ""), 10);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("sessionId must be a positive integer");
  }

  const session = getPomodoroSession(userIdValue, id);
  if (!session) {
    return null;
  }

  if (session.status !== "running") {
    return session;
  }

  const parsedEndedAt = Date.parse(String(endedAt || ""));
  const endedAtValue = Number.isFinite(parsedEndedAt)
    ? new Date(parsedEndedAt).toISOString()
    : new Date().toISOString();

  const startedAtMs = Date.parse(String(session.startedAt || ""));
  const endedAtMs = Date.parse(endedAtValue);
  const inferredDuration =
    Number.isFinite(startedAtMs) && Number.isFinite(endedAtMs) && endedAtMs >= startedAtMs
      ? Math.floor((endedAtMs - startedAtMs) / 1000)
      : session.plannedMinutes * 60;

  const nextStatus = normalizePomodoroStatus(status, "completed");
  const writeStatus = nextStatus === "running" ? "completed" : nextStatus;
  const result = finishPomodoroSessionQuery.run({
    id,
    user_id: userIdValue,
    ended_at: endedAtValue,
    duration_seconds: clampPomodoroDurationSeconds(durationSeconds, inferredDuration),
    status: writeStatus,
  });

  if (Number(result.changes || 0) <= 0) {
    return getPomodoroSession(userIdValue, id);
  }

  return getPomodoroSession(userIdValue, id);
}

function getPomodoroStats(userId, options = {}) {
  const normalized = normalizePomodoroFilterOptions(userId, options);
  const summaryRow = getPomodoroSummaryQuery.get(normalized) || {};
  const byTodoRows = listPomodoroByTodoQuery.all(normalized);
  const recentRows = listPomodoroRecentSessionsQuery.all(normalized);

  return {
    filter: {
      todoId: normalized.todo_id > 0 ? normalized.todo_id : null,
      from: normalized.from || null,
      to: normalized.to || null,
    },
    summary: {
      totalSessions: Number(summaryRow.total_sessions || 0),
      completedSessions: Number(summaryRow.completed_sessions || 0),
      cancelledSessions: Number(summaryRow.cancelled_sessions || 0),
      totalSeconds: Number(summaryRow.total_seconds || 0),
      completedSeconds: Number(summaryRow.completed_seconds || 0),
    },
    byTodo: byTodoRows.map((row) => ({
      todoId: Number(row.todo_id),
      title: String(row.title || ""),
      project: String(row.project || "默认项目"),
      totalSessions: Number(row.total_sessions || 0),
      completedSessions: Number(row.completed_sessions || 0),
      totalSeconds: Number(row.total_seconds || 0),
      completedSeconds: Number(row.completed_seconds || 0),
      lastStartedAt: row.last_started_at ? String(row.last_started_at) : null,
    })),
    recent: recentRows.map(mapPomodoroSession),
    running: getRunningPomodoroSession(userId),
  };
}

module.exports = {
  dbFile,
  listTodos,
  createTodo,
  createTodosBulk,
  updateTodo,
  getTodo,
  toggleTodo,
  hasActiveChildren,
  deleteTodoTree,
  clearCompletedTodos,
  updateTodosBatch,
  importTodos,
  exportTodos,
  hasUndoSnapshot,
  undoLastOperation,
  getStats,
  listParentCandidates,
  listProjects,
  createUser,
  getUserByEmail,
  getUserById,
  getUserByVerifyTokenHash,
  getUserByResetTokenHash,
  countUsers,
  claimUnownedTodos,
  setVerificationToken,
  markEmailVerified,
  setResetToken,
  setRegistrationCode,
  getRegistrationCodeByEmail,
  clearRegistrationCodeByEmail,
  clearResetToken,
  updateUserEmail,
  updateUserPassword,
  createIntegrationToken,
  listIntegrationTokens,
  getIntegrationTokenByHash,
  touchIntegrationToken,
  revokeIntegrationToken,
  upsertTodosByIntegration,
  createPomodoroSession,
  getPomodoroSession,
  getRunningPomodoroSession,
  finishPomodoroSession,
  getPomodoroStats,
};
