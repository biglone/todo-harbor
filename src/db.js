const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "data");
const dbFile = process.env.DB_FILE || path.join(dataDir, "todos.db");

fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(dbFile);
db.pragma("journal_mode = WAL");

const lastUndoSnapshots = new Map();

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
  )
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

  CREATE TABLE IF NOT EXISTS todos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    title TEXT NOT NULL CHECK (length(trim(title)) > 0),
    project TEXT NOT NULL DEFAULT '默认项目',
    due_date TEXT,
    parent_id INTEGER,
    completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TEXT
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

if (!tableColumns.has("parent_id")) {
  db.exec(`ALTER TABLE todos ADD COLUMN parent_id INTEGER;`);
}

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_todos_user_id ON todos (user_id);
  CREATE INDEX IF NOT EXISTS idx_todos_completed ON todos (completed);
  CREATE INDEX IF NOT EXISTS idx_todos_project ON todos (project);
  CREATE INDEX IF NOT EXISTS idx_todos_due_date ON todos (due_date);
  CREATE INDEX IF NOT EXISTS idx_todos_parent_id ON todos (parent_id);
  CREATE INDEX IF NOT EXISTS idx_users_verify_token_hash ON users (verify_token_hash);
  CREATE INDEX IF NOT EXISTS idx_users_reset_token_hash ON users (reset_token_hash);
`);

const createUserQuery = db.prepare(`
  INSERT INTO users (email, password_hash)
  VALUES (@email, @password_hash)
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

const listTodosCreatedDescQuery = db.prepare(`
  SELECT id, title, project, due_date, parent_id, completed, created_at, completed_at
  FROM todos
  WHERE ${listFilterWhereWithScopeClause}
  ORDER BY id DESC
  LIMIT @limit OFFSET @offset
`);

const listTodosCreatedAscQuery = db.prepare(`
  SELECT id, title, project, due_date, parent_id, completed, created_at, completed_at
  FROM todos
  WHERE ${listFilterWhereWithScopeClause}
  ORDER BY id ASC
  LIMIT @limit OFFSET @offset
`);

const listTodosDueAscQuery = db.prepare(`
  SELECT id, title, project, due_date, parent_id, completed, created_at, completed_at
  FROM todos
  WHERE ${listFilterWhereWithScopeClause}
  ORDER BY
    CASE WHEN due_date IS NULL THEN 1 ELSE 0 END ASC,
    due_date ASC,
    id DESC
  LIMIT @limit OFFSET @offset
`);

const listTodosDueDescQuery = db.prepare(`
  SELECT id, title, project, due_date, parent_id, completed, created_at, completed_at
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
  INSERT INTO todos (user_id, title, project, due_date, parent_id)
  VALUES (@user_id, @title, @project, @due_date, @parent_id)
`);

const updateTodoQuery = db.prepare(`
  UPDATE todos
  SET
    title = @title,
    project = @project,
    due_date = @due_date,
    parent_id = @parent_id
  WHERE id = @id AND user_id = @user_id
`);

const getTodoByIdQuery = db.prepare(`
  SELECT id, title, project, due_date, parent_id, completed, created_at, completed_at
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
    due_date = @due_date
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
  SELECT id, title, project, due_date, parent_id, completed, created_at, completed_at
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
  SELECT id, title, project, due_date, parent_id, completed, created_at, completed_at
  FROM todos
  WHERE user_id = @user_id
  ORDER BY id ASC
`);

const insertTodoRawQuery = db.prepare(`
  INSERT INTO todos (id, user_id, title, project, due_date, parent_id, completed, created_at, completed_at)
  VALUES (@id, @user_id, @title, @project, @due_date, @parent_id, @completed, @created_at, @completed_at)
`);

const insertImportedTodoQuery = db.prepare(`
  INSERT INTO todos (user_id, title, project, due_date, parent_id, completed, created_at, completed_at)
  VALUES (@user_id, @title, @project, @due_date, @parent_id, @completed, @created_at, @completed_at)
`);

const updateImportedParentQuery = db.prepare(`
  UPDATE todos
  SET parent_id = @parent_id
  WHERE id = @id AND user_id = @user_id
`);

function mapTodo(row) {
  return {
    ...row,
    completed: Boolean(row.completed),
  };
}

function mapRawTodo(row) {
  return {
    ...row,
    completed: Number(row.completed || 0),
  };
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

function formatDateForInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getTodayDateString() {
  return formatDateForInput(new Date());
}

function getDateAfterDaysString(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return formatDateForInput(date);
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

function normalizeTodoPayload({ title: rawTitle, project: rawProject, dueDate: rawDueDate, parentId, userId }) {
  const title = String(rawTitle || "").trim();
  const project = String(rawProject || "").trim() || "默认项目";
  const dueDate = rawDueDate ? String(rawDueDate).trim() : null;
  const parentIdValue = Number.isInteger(parentId) && parentId > 0 ? parentId : null;

  return {
    user_id: requireUserId(userId),
    title,
    project,
    due_date: dueDate || null,
    parent_id: parentIdValue,
  };
}

function saveUndoSnapshot(userId) {
  const id = requireUserId(userId);
  lastUndoSnapshots.set(id, listTodosByUserRawQuery.all({ user_id: id }).map(mapRawTodo));
}

function hasUndoSnapshot(userId) {
  const id = requireUserId(userId);
  return lastUndoSnapshots.has(id);
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
        parent_id: Number.isInteger(row.parent_id) ? row.parent_id : null,
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
  if (!lastUndoSnapshots.has(id)) {
    return {
      restored: false,
      count: 0,
    };
  }

  const snapshot = lastUndoSnapshots.get(id);
  restoreSnapshot(id, snapshot);
  lastUndoSnapshots.delete(id);

  return {
    restored: true,
    count: snapshot.length,
  };
}

function insertTodo(payload) {
  const result = createTodoQuery.run(payload);
  return getTodo(payload.user_id, result.lastInsertRowid);
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

function updateTodosBatch(userId, { ids, project, dueDate, completed }) {
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

      if (project !== undefined || dueDate !== undefined) {
        const nextProject = project !== undefined ? project : current.project;
        const nextDueDate = dueDate !== undefined ? dueDate : current.due_date;
        const updateResult = updateTodoProjectDueQuery.run({
          id,
          user_id: userIdValue,
          project: nextProject,
          due_date: nextDueDate || null,
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
        parent_id: null,
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
    parent_id: Number.isInteger(row.parent_id) ? row.parent_id : null,
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

function createUser({ email, passwordHash }) {
  const result = createUserQuery.run({ email, password_hash: passwordHash });
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
  clearResetToken,
  updateUserEmail,
  updateUserPassword,
};
