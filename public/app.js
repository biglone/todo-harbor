const state = {
  filter: "all",
  busy: false,
};

const todoListEl = document.getElementById("todoList");
const todoFormEl = document.getElementById("todoForm");
const todoInputEl = document.getElementById("todoInput");
const addButtonEl = document.getElementById("addButton");
const messageBarEl = document.getElementById("messageBar");
const syncStatusEl = document.getElementById("syncStatus");
const templateEl = document.getElementById("todoTemplate");

const countAllEl = document.getElementById("countAll");
const countActiveEl = document.getElementById("countActive");
const countCompletedEl = document.getElementById("countCompleted");
const filterButtons = document.querySelectorAll(".filter");

function setBusy(nextBusy) {
  state.busy = nextBusy;
  addButtonEl.disabled = nextBusy;
}

function setMessage(text, isError = false) {
  messageBarEl.textContent = text;
  messageBarEl.classList.toggle("is-error", Boolean(isError));
}

function setSyncStatus(text, isError = false) {
  syncStatusEl.textContent = text;
  syncStatusEl.classList.toggle("is-error", Boolean(isError));
}

function normalizeSqliteTime(value) {
  if (typeof value !== "string") {
    return value;
  }
  return value.includes("T") ? value : value.replace(" ", "T");
}

function formatDateTime(value) {
  if (!value) {
    return "未完成";
  }

  const date = new Date(normalizeSqliteTime(value));
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function renderTodos(items) {
  todoListEl.innerHTML = "";
  if (!items.length) {
    const emptyEl = document.createElement("li");
    emptyEl.className = "empty";
    emptyEl.textContent =
      state.filter === "completed"
        ? "还没有已完成的待办。"
        : "当前没有待办，开始添加你的第一条任务。";
    todoListEl.appendChild(emptyEl);
    return;
  }

  for (const item of items) {
    const node = templateEl.content.firstElementChild.cloneNode(true);
    const toggleButton = node.querySelector(".toggle");
    const titleEl = node.querySelector(".todo-title");
    const metaEl = node.querySelector(".todo-meta");

    node.dataset.todoId = String(item.id);
    node.classList.toggle("is-completed", item.completed);

    titleEl.textContent = item.title;
    metaEl.textContent = item.completed
      ? `创建于 ${formatDateTime(item.created_at)} · 完成于 ${formatDateTime(item.completed_at)}`
      : `创建于 ${formatDateTime(item.created_at)}`;

    toggleButton.setAttribute(
      "aria-label",
      item.completed ? "标记为未完成" : "标记为已完成",
    );

    toggleButton.addEventListener("click", () => onToggleTodo(item.id));
    todoListEl.appendChild(node);
  }
}

function renderStats(stats) {
  countAllEl.textContent = String(stats.total || 0);
  countActiveEl.textContent = String(stats.active || 0);
  countCompletedEl.textContent = String(stats.completed || 0);
}

function renderFilters() {
  for (const button of filterButtons) {
    const selected = button.dataset.filter === state.filter;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-selected", selected ? "true" : "false");
  }
}

async function requestJSON(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Request failed with status ${response.status}`);
  }
  return payload;
}

async function loadTodos({ silent = false } = {}) {
  if (!silent) {
    setBusy(true);
    setMessage("正在同步数据...");
  }

  try {
    const payload = await requestJSON(`/api/todos?filter=${encodeURIComponent(state.filter)}`);
    renderStats(payload.stats || {});
    renderTodos(payload.items || []);
    renderFilters();
    setSyncStatus("已连接");
    if (!silent) {
      setMessage(`已加载 ${payload.items.length} 条记录`);
    }
  } catch (error) {
    setSyncStatus("连接异常", true);
    setMessage(error.message || "数据加载失败", true);
  } finally {
    setBusy(false);
  }
}

async function onAddTodo(event) {
  event.preventDefault();
  const title = todoInputEl.value.trim();
  if (!title) {
    setMessage("请输入待办内容", true);
    return;
  }

  setBusy(true);
  setMessage("正在保存...");
  try {
    await requestJSON("/api/todos", {
      method: "POST",
      body: JSON.stringify({ title }),
    });
    todoInputEl.value = "";
    setMessage("保存成功");
    await loadTodos({ silent: true });
  } catch (error) {
    setMessage(error.message || "保存失败", true);
  } finally {
    setBusy(false);
  }
}

async function onToggleTodo(id) {
  setBusy(true);
  setMessage("正在更新状态...");
  try {
    await requestJSON(`/api/todos/${id}/toggle`, { method: "PATCH" });
    setMessage("状态已更新");
    await loadTodos({ silent: true });
  } catch (error) {
    setMessage(error.message || "更新失败", true);
  } finally {
    setBusy(false);
  }
}

for (const button of filterButtons) {
  button.addEventListener("click", async () => {
    if (state.busy) {
      return;
    }
    state.filter = button.dataset.filter;
    await loadTodos();
  });
}

todoFormEl.addEventListener("submit", onAddTodo);
loadTodos();
