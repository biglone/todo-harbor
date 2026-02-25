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

function createTestRequest() {
  const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const dataDir = path.join(os.tmpdir(), `todo-harbor-test-${id}`);
  fs.mkdirSync(dataDir, { recursive: true });
  process.env.DATA_DIR = dataDir;
  process.env.DB_FILE = path.join(dataDir, "todos.db");

  clearRequireCache("../src/db");
  clearRequireCache("../src/app");
  const app = require("../src/app");
  return supertest.agent(app);
}

async function registerAndLogin(request) {
  const email = `user-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
  const password = "password123";
  const res = await request.post("/api/auth/register").send({ email, password });
  assert.equal(res.status, 201);
  return res.body;
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
});
