const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const supertest = require("supertest");

function clearRequireCache(modulePath) {
  try {
    delete require.cache[require.resolve(modulePath)];
  } catch (error) {
    // ignore missing module cache
  }
}

function formatDateForInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateOffset(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return formatDateForInput(date);
}

function shiftDate(dateString, days) {
  const [year, month, day] = String(dateString || "")
    .split("-")
    .map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return formatDateForInput(date);
}

function createTestRequest({ env = {} } = {}) {
  const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const dataDir = path.join(os.tmpdir(), `todo-harbor-test-${id}`);
  fs.mkdirSync(dataDir, { recursive: true });
  process.env.DATA_DIR = dataDir;
  process.env.DB_FILE = path.join(dataDir, "todos.db");
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined || value === null) {
      delete process.env[key];
      continue;
    }
    process.env[key] = String(value);
  }

  clearRequireCache("../src/db");
  clearRequireCache("../src/app");
  const app = require("../src/app");
  return supertest.agent(app);
}

async function registerUser(request, overrides = {}) {
  const email = overrides.email || `user-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
  const password = overrides.password || "password123";

  const codeRes = await request.post("/api/auth/register/code/request").send({ email });
  assert.equal(codeRes.status, 200);
  assert.ok(codeRes.body.registerCode);

  const registerRes = await request.post("/api/auth/register").send({
    email,
    password,
    code: codeRes.body.registerCode,
  });
  assert.equal(registerRes.status, 201);

  return { ...registerRes.body, email, password };
}

async function registerAndLogin(request, overrides = {}) {
  const created = await registerUser(request, overrides);
  const loginRes = await request.post("/api/auth/login").send({
    email: created.email,
    password: created.password,
  });
  assert.equal(loginRes.status, 200);
  return { ...loginRes.body, email: created.email, password: created.password };
}

async function createTodo(request, payload) {
  const res = await request.post("/api/todos").send(payload);
  assert.equal(res.status, 201);
  return res.body;
}

async function listTodos(request, query = {}) {
  const res = await request.get("/api/todos").query(query);
  assert.equal(res.status, 200);
  return res.body;
}

function assertDescendingIds(items) {
  for (let i = 0; i < items.length - 1; i += 1) {
    assert.ok(items[i].id > items[i + 1].id);
  }
}

describe("Todos API", () => {
  test("create edit delete and cascade", async () => {
    const request = createTestRequest();
    await registerAndLogin(request);

    const parent = await createTodo(request, { title: "Parent" });
    const child = await createTodo(request, { title: "Child", parentId: parent.id });
    assert.ok(child.parent_id === parent.id);

    const listBefore = await listTodos(request);
    assert.equal(listBefore.items.length, 2);

    const updated = await request.patch(`/api/todos/${parent.id}`).send({ title: "Parent Updated" });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.title, "Parent Updated");

    const deleted = await request.delete(`/api/todos/${parent.id}`);
    assert.equal(deleted.status, 200);
    assert.equal(deleted.body.count, 2);

    const listAfter = await listTodos(request);
    assert.equal(listAfter.items.length, 0);
  });

  test("bulk create and batch update", async () => {
    const request = createTestRequest();
    await registerAndLogin(request);

    const bulk = await request.post("/api/todos/bulk").send({
      titles: ["A", "B", "C"],
      project: "Project A",
      dueDate: dateOffset(3),
    });
    assert.equal(bulk.status, 201);
    assert.equal(bulk.body.count, 3);

    const list = await listTodos(request);
    const ids = list.items.map((item) => item.id);

    const batchProject = await request.post("/api/todos/batch").send({
      ids,
      project: "Project B",
    });
    assert.equal(batchProject.status, 200);
    assert.equal(batchProject.body.count, 3);

    const batchDue = await request.post("/api/todos/batch").send({
      ids,
      dueDate: dateOffset(7),
    });
    assert.equal(batchDue.status, 200);
    assert.equal(batchDue.body.count, 3);

    const listAfter = await listTodos(request);
    for (const item of listAfter.items) {
      assert.equal(item.project, "Project B");
      assert.equal(item.due_date, dateOffset(7));
    }
  });

  test("priority status tags and filters", async () => {
    const request = createTestRequest();
    await registerAndLogin(request);

    const first = await createTodo(request, {
      title: "Release Checklist",
      priority: "high",
      status: "blocked",
      tags: ["紧急", "后端", "后端"],
    });
    assert.equal(first.priority, "high");
    assert.equal(first.status, "blocked");
    assert.deepEqual(first.tags, ["紧急", "后端"]);

    const second = await createTodo(request, {
      title: "Routine Cleanup",
      priority: "low",
      status: "todo",
      tags: "维护,ops",
    });
    assert.equal(second.priority, "low");
    assert.equal(second.status, "todo");
    assert.deepEqual(second.tags, ["维护", "ops"]);

    const byPriority = await listTodos(request, { priority: "high" });
    assert.equal(byPriority.items.length, 1);
    assert.equal(byPriority.items[0].id, first.id);

    const byStatus = await listTodos(request, { status: "blocked" });
    assert.equal(byStatus.items.length, 1);
    assert.equal(byStatus.items[0].id, first.id);

    const patched = await request.patch(`/api/todos/${first.id}`).send({
      priority: "medium",
      status: "in_progress",
      tags: ["联调", "本周"],
    });
    assert.equal(patched.status, 200);
    assert.equal(patched.body.priority, "medium");
    assert.equal(patched.body.status, "in_progress");
    assert.deepEqual(patched.body.tags, ["联调", "本周"]);

    const batchRes = await request.post("/api/todos/batch").send({
      ids: [first.id, second.id],
      priority: "high",
      status: "in_progress",
      tags: ["批量", "统一"],
    });
    assert.equal(batchRes.status, 200);
    assert.equal(batchRes.body.count, 2);

    const inProgress = await listTodos(request, { status: "in_progress" });
    assert.equal(inProgress.items.length, 2);
    for (const item of inProgress.items) {
      assert.equal(item.priority, "high");
      assert.equal(item.status, "in_progress");
      assert.deepEqual(item.tags, ["批量", "统一"]);
    }

    const exportRes = await request.get("/api/todos/export");
    assert.equal(exportRes.status, 200);
    assert.ok(Array.isArray(exportRes.body.items[0].tags));
    assert.ok(["high", "medium", "low"].includes(exportRes.body.items[0].priority));
    assert.ok(["todo", "in_progress", "blocked"].includes(exportRes.body.items[0].status));
  });

  test("recurring todo generates next occurrence on completion", async () => {
    const request = createTestRequest();
    await registerAndLogin(request);

    const dueDate = dateOffset(2);
    const recurring = await createTodo(request, {
      title: "Daily standup",
      dueDate,
      recurrence: "daily",
      status: "in_progress",
    });
    assert.equal(recurring.recurrence, "daily");
    assert.equal(recurring.due_date, dueDate);

    const badCreate = await request.post("/api/todos").send({
      title: "Broken recurring",
      recurrence: "weekly",
    });
    assert.equal(badCreate.status, 400);

    const toggle = await request.patch(`/api/todos/${recurring.id}/toggle`);
    assert.equal(toggle.status, 200);
    assert.equal(toggle.body.completed, true);

    const all = await listTodos(request, { sort: "created_asc" });
    assert.equal(all.items.length, 2);

    const previous = all.items.find((item) => item.id === recurring.id);
    assert.ok(previous);
    assert.equal(previous.completed, true);
    assert.equal(previous.recurrence, "daily");

    const next = all.items.find((item) => item.id !== recurring.id);
    assert.ok(next);
    assert.equal(next.completed, false);
    assert.equal(next.recurrence, "daily");
    assert.equal(next.status, "todo");
    assert.equal(next.due_date, shiftDate(dueDate, 1));
  });

  test("hierarchy rules", async () => {
    const request = createTestRequest();
    await registerAndLogin(request);

    const parent = await createTodo(request, { title: "Parent" });
    const child = await createTodo(request, { title: "Child", parentId: parent.id });

    const toggleParent = await request.patch(`/api/todos/${parent.id}/toggle`);
    assert.equal(toggleParent.status, 400);

    const solo = await createTodo(request, { title: "Solo" });
    const completeSolo = await request.patch(`/api/todos/${solo.id}/toggle`);
    assert.equal(completeSolo.status, 200);

    const createWithCompletedParent = await request.post("/api/todos").send({
      title: "Invalid Child",
      parentId: solo.id,
    });
    assert.equal(createWithCompletedParent.status, 400);

    const a = await createTodo(request, { title: "A" });
    const b = await createTodo(request, { title: "B", parentId: a.id });

    const selfParent = await request.patch(`/api/todos/${a.id}`).send({ parentId: a.id });
    assert.equal(selfParent.status, 400);

    const cycle = await request.patch(`/api/todos/${a.id}`).send({ parentId: b.id });
    assert.equal(cycle.status, 400);

    const deleteParent = await request.delete(`/api/todos/${parent.id}`);
    assert.equal(deleteParent.status, 200);
    assert.equal(deleteParent.body.count, 2);
  });

  test("due scope filter and snapshot", async () => {
    const request = createTestRequest();
    await registerAndLogin(request);

    await createTodo(request, { title: "Overdue", dueDate: dateOffset(-1) });
    await createTodo(request, { title: "Today", dueDate: dateOffset(0) });
    await createTodo(request, { title: "Upcoming", dueDate: dateOffset(3) });
    await createTodo(request, { title: "Future", dueDate: dateOffset(10) });
    await createTodo(request, { title: "No due" });

    const overdue = await listTodos(request, { dueScope: "overdue" });
    assert.equal(overdue.items.length, 1);

    const today = await listTodos(request, { dueScope: "today" });
    assert.equal(today.items.length, 1);

    const week = await listTodos(request, { dueScope: "week" });
    assert.equal(week.items.length, 2);

    const noDue = await listTodos(request, { dueScope: "no_due" });
    assert.equal(noDue.items.length, 1);

    const all = await listTodos(request, { dueScope: "all" });
    assert.deepEqual(all.dueSnapshot, {
      overdue: 1,
      today: 1,
      upcoming: 1,
      noDue: 1,
    });
  });

  test("pagination", async () => {
    const request = createTestRequest();
    await registerAndLogin(request);

    const firstBatch = Array.from({ length: 50 }, (_value, idx) => `Task ${idx + 1}`);
    const secondBatch = Array.from({ length: 15 }, (_value, idx) => `Task ${idx + 51}`);

    const bulkOne = await request.post("/api/todos/bulk").send({ titles: firstBatch });
    assert.equal(bulkOne.status, 201);
    const bulkTwo = await request.post("/api/todos/bulk").send({ titles: secondBatch });
    assert.equal(bulkTwo.status, 201);

    const pageOne = await listTodos(request, { page: 1, pageSize: 30 });
    assert.equal(pageOne.items.length, 30);
    assert.equal(pageOne.pagination.total, 65);
    assert.equal(pageOne.pagination.totalPages, 3);
    assert.equal(pageOne.pagination.hasNext, true);
    assertDescendingIds(pageOne.items);

    const pageThree = await listTodos(request, { page: 3, pageSize: 30 });
    assert.equal(pageThree.items.length, 5);
    assert.equal(pageThree.pagination.hasNext, false);
  });

  test("export import and undo", async () => {
    const request = createTestRequest();
    await registerAndLogin(request);

    await createTodo(request, { title: "Keep 1" });
    await createTodo(request, { title: "Keep 2" });

    const exportRes = await request.get("/api/todos/export");
    assert.equal(exportRes.status, 200);
    assert.equal(exportRes.body.count, 2);

    await createTodo(request, { title: "Temp" });

    const importRes = await request
      .post("/api/todos/import")
      .send({ mode: "replace", items: exportRes.body.items });
    assert.equal(importRes.status, 201);
    assert.equal(importRes.body.count, 2);

    const afterImport = await listTodos(request);
    assert.equal(afterImport.items.length, 2);

    const undoRes = await request.post("/api/todos/undo");
    assert.equal(undoRes.status, 200);

    const afterUndo = await listTodos(request);
    assert.equal(afterUndo.items.length, 3);
  });

  test("undo supports multiple steps", async () => {
    const request = createTestRequest();
    await registerAndLogin(request);

    const first = await createTodo(request, { title: "First" });
    const second = await createTodo(request, { title: "Second" });

    const updated = await request.patch(`/api/todos/${first.id}`).send({ title: "First Updated" });
    assert.equal(updated.status, 200);

    const deleted = await request.delete(`/api/todos/${second.id}`);
    assert.equal(deleted.status, 200);
    assert.equal(deleted.body.count, 1);

    const afterDelete = await listTodos(request);
    assert.equal(afterDelete.items.length, 1);
    assert.equal(afterDelete.items[0].title, "First Updated");

    const undoDelete = await request.post("/api/todos/undo");
    assert.equal(undoDelete.status, 200);
    const afterUndoDelete = await listTodos(request);
    assert.equal(afterUndoDelete.items.length, 2);
    assert.ok(afterUndoDelete.items.some((item) => item.title === "Second"));

    const undoUpdate = await request.post("/api/todos/undo");
    assert.equal(undoUpdate.status, 200);
    const afterUndoUpdate = await listTodos(request);
    const restoredFirst = afterUndoUpdate.items.find((item) => item.id === first.id);
    assert.ok(restoredFirst);
    assert.equal(restoredFirst.title, "First");
  });

  test("registration requires email code and login is separate", async () => {
    const request = createTestRequest();
    const email = `verify-${Date.now()}@example.com`;
    const password = "password123";

    const codeRes = await request.post("/api/auth/register/code/request").send({ email });
    assert.equal(codeRes.status, 200);
    assert.ok(codeRes.body.registerCode);

    const badRegister = await request.post("/api/auth/register").send({
      email,
      password,
      code: "000000",
    });
    assert.equal(badRegister.status, 400);

    const registerRes = await request.post("/api/auth/register").send({
      email,
      password,
      code: codeRes.body.registerCode,
    });
    assert.equal(registerRes.status, 201);
    assert.equal(registerRes.body.emailVerified, true);

    const meBeforeLogin = await request.get("/api/auth/me");
    assert.equal(meBeforeLogin.status, 401);

    const login = await request.post("/api/auth/login").send({ email, password });
    assert.equal(login.status, 200);
    assert.equal(login.body.emailVerified, true);

    const me = await request.get("/api/auth/me");
    assert.equal(me.status, 200);
    assert.equal(me.body.emailVerified, true);
  });

  test("auth login endpoint is rate limited", async () => {
    const request = createTestRequest({
      env: {
        AUTH_RATE_LIMIT_WINDOW_MS: 60_000,
        AUTH_LOGIN_RATE_LIMIT_MAX: 3,
      },
    });
    const email = `rate-${Date.now()}@example.com`;
    const password = "password123";

    await registerUser(request, { email, password });

    for (let i = 0; i < 3; i += 1) {
      const failed = await request.post("/api/auth/login").send({ email, password: "wrong-password" });
      assert.equal(failed.status, 401);
    }

    const limited = await request.post("/api/auth/login").send({ email, password: "wrong-password" });
    assert.equal(limited.status, 429);
    assert.equal(limited.body.error, "Too many requests, please retry later");
    assert.ok(Number(limited.body.retryAfterSec) > 0);
  });

  test("page routes are guarded by session", async () => {
    const request = createTestRequest();

    const rootGuest = await request.get("/");
    assert.equal(rootGuest.status, 302);
    assert.equal(rootGuest.headers.location, "/auth");

    const appGuest = await request.get("/app");
    assert.equal(appGuest.status, 302);
    assert.equal(appGuest.headers.location, "/auth");

    const settingsGuest = await request.get("/settings");
    assert.equal(settingsGuest.status, 302);
    assert.equal(settingsGuest.headers.location, "/auth");

    await registerAndLogin(request);

    const rootAuthed = await request.get("/");
    assert.equal(rootAuthed.status, 302);
    assert.equal(rootAuthed.headers.location, "/app");

    const authAuthed = await request.get("/auth");
    assert.equal(authAuthed.status, 302);
    assert.equal(authAuthed.headers.location, "/app");

    const appAuthed = await request.get("/app");
    assert.equal(appAuthed.status, 200);

    const settingsAuthed = await request.get("/settings");
    assert.equal(settingsAuthed.status, 200);
  });

  test("password reset flow", async () => {
    const request = createTestRequest();
    const user = await registerAndLogin(request);

    const logout = await request.post("/api/auth/logout");
    assert.equal(logout.status, 200);

    const forgot = await request.post("/api/auth/password/forgot").send({ email: user.email });
    assert.equal(forgot.status, 200);
    assert.ok(forgot.body.resetToken);

    const reset = await request.post("/api/auth/password/reset").send({
      token: forgot.body.resetToken,
      password: "newpassword123",
    });
    assert.equal(reset.status, 200);

    const login = await request.post("/api/auth/login").send({
      email: user.email,
      password: "newpassword123",
    });
    assert.equal(login.status, 200);
  });

  test("account settings update", async () => {
    const request = createTestRequest();
    const user = await registerAndLogin(request);

    const emailUpdate = await request.post("/api/account/email").send({
      email: `updated-${Date.now()}@example.com`,
      password: user.password,
    });
    assert.equal(emailUpdate.status, 200);
    assert.equal(emailUpdate.body.emailVerified, false);
    assert.ok(emailUpdate.body.verifyToken);

    const verify = await request.post("/api/auth/verify").send({ token: emailUpdate.body.verifyToken });
    assert.equal(verify.status, 200);

    const passUpdate = await request.post("/api/account/password").send({
      currentPassword: user.password,
      newPassword: "nextpassword123",
    });
    assert.equal(passUpdate.status, 200);
  });
});
