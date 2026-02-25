const state = {
  filter: "all",
  viewMode: "flat",
  busy: false,
  items: [],
};

const todoListEl = document.getElementById("todoList");
const todoFormEl = document.getElementById("todoForm");
const todoInputEl = document.getElementById("todoInput");
const projectInputEl = document.getElementById("projectInput");
const dueDateInputEl = document.getElementById("dueDateInput");
const parentSelectEl = document.getElementById("parentSelect");
const projectSuggestionsEl = document.getElementById("projectSuggestions");
const addButtonEl = document.getElementById("addButton");
const messageBarEl = document.getElementById("messageBar");
const syncStatusEl = document.getElementById("syncStatus");
const templateEl = document.getElementById("todoTemplate");

const countAllEl = document.getElementById("countAll");
const countActiveEl = document.getElementById("countActive");
const countCompletedEl = document.getElementById("countCompleted");
const filterButtons = document.querySelectorAll(".filter");
const viewModeButtons = document.querySelectorAll(".view-mode");

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

function formatDateOnly(value) {
  if (!value) {
    return "未设置日期";
  }

  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
  }).format(date);
}

function buildTodoTree(items) {
  const nodeMap = new Map();
  for (const item of items) {
    nodeMap.set(item.id, {
      ...item,
      children: [],
    });
  }

  const roots = [];
  for (const item of items) {
    const node = nodeMap.get(item.id);
    if (node.parent_id && node.parent_id !== node.id && nodeMap.has(node.parent_id)) {
      nodeMap.get(node.parent_id).children.push(node);
    } else {
      roots.push(node);
    }
  }

  for (const node of nodeMap.values()) {
    node.children.sort((a, b) => b.id - a.id);
  }

  return roots;
}

function countTreeNodes(node) {
  let count = 1;
  for (const child of node.children) {
    count += countTreeNodes(child);
  }
  return count;
}

function renderTodoNode(item, depth) {
  const node = templateEl.content.firstElementChild.cloneNode(true);
  const toggleButton = node.querySelector(".toggle");
  const titleEl = node.querySelector(".todo-title");
  const tagsEl = node.querySelector(".todo-tags");
  const metaEl = node.querySelector(".todo-meta");

  node.dataset.todoId = String(item.id);
  node.classList.toggle("is-completed", item.completed);
  node.style.marginLeft = `${Math.min(depth * 20, 120)}px`;

  if (depth > 0) {
    node.classList.add("is-child");
  }

  titleEl.textContent = item.title;

  const projectTag = document.createElement("span");
  projectTag.className = "tag";
  projectTag.textContent = item.project || "默认项目";
  tagsEl.appendChild(projectTag);

  if (item.due_date) {
    const dueDateTag = document.createElement("span");
    dueDateTag.className = "tag tag-date";
    dueDateTag.textContent = formatDateOnly(item.due_date);
    tagsEl.appendChild(dueDateTag);
  }

  if (depth > 0) {
    const childTag = document.createElement("span");
    childTag.className = "tag tag-child";
    childTag.textContent = `子任务 L${depth + 1}`;
    tagsEl.appendChild(childTag);
  }

  metaEl.textContent = item.completed
    ? `创建于 ${formatDateTime(item.created_at)} · 完成于 ${formatDateTime(item.completed_at)}`
    : `创建于 ${formatDateTime(item.created_at)}`;

  toggleButton.setAttribute(
    "aria-label",
    item.completed ? "标记为未完成" : "标记为已完成",
  );

  toggleButton.addEventListener("click", () => onToggleTodo(item.id));
  return node;
}

function renderTodoTree(container, nodes, depth, visited) {
  for (const node of nodes) {
    if (visited.has(node.id)) {
      continue;
    }
    visited.add(node.id);
    container.appendChild(renderTodoNode(node, depth));

    if (node.children.length > 0) {
      renderTodoTree(container, node.children, depth + 1, visited);
    }
  }
}

function renderEmpty() {
  const emptyEl = document.createElement("div");
  emptyEl.className = "empty";
  emptyEl.textContent =
    state.filter === "completed"
      ? "还没有已完成的待办。"
      : "当前没有待办，开始添加你的第一条任务。";
  todoListEl.appendChild(emptyEl);
}

function renderGroupedByProject(roots) {
  const groups = new Map();
  for (const root of roots) {
    const key = root.project || "默认项目";
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(root);
  }

  const sortedKeys = [...groups.keys()].sort((a, b) => a.localeCompare(b, "zh-CN"));
  for (const key of sortedKeys) {
    const section = document.createElement("section");
    section.className = "group-section";

    const head = document.createElement("div");
    head.className = "group-head";

    const title = document.createElement("h3");
    title.textContent = key;
    head.appendChild(title);

    const size = document.createElement("span");
    const total = groups.get(key).reduce((sum, item) => sum + countTreeNodes(item), 0);
    size.textContent = `${total} 项`;
    head.appendChild(size);

    section.appendChild(head);

    const body = document.createElement("div");
    body.className = "group-body";
    renderTodoTree(body, groups.get(key), 0, new Set());
    section.appendChild(body);
    todoListEl.appendChild(section);
  }
}

function renderGroupedByDate(roots) {
  const groups = new Map();
  for (const root of roots) {
    const key = root.due_date || "未设置日期";
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(root);
  }

  const sortedKeys = [...groups.keys()].sort((a, b) => {
    if (a === "未设置日期") {
      return 1;
    }
    if (b === "未设置日期") {
      return -1;
    }
    return a.localeCompare(b);
  });

  for (const key of sortedKeys) {
    const section = document.createElement("section");
    section.className = "group-section";

    const head = document.createElement("div");
    head.className = "group-head";

    const title = document.createElement("h3");
    title.textContent = key === "未设置日期" ? key : formatDateOnly(key);
    head.appendChild(title);

    const size = document.createElement("span");
    const total = groups.get(key).reduce((sum, item) => sum + countTreeNodes(item), 0);
    size.textContent = `${total} 项`;
    head.appendChild(size);

    section.appendChild(head);

    const body = document.createElement("div");
    body.className = "group-body";
    renderTodoTree(body, groups.get(key), 0, new Set());
    section.appendChild(body);
    todoListEl.appendChild(section);
  }
}

function renderTodos(items) {
  todoListEl.innerHTML = "";
  if (!items.length) {
    renderEmpty();
    return;
  }

  const roots = buildTodoTree(items);
  if (state.viewMode === "project") {
    renderGroupedByProject(roots);
    return;
  }

  if (state.viewMode === "date") {
    renderGroupedByDate(roots);
    return;
  }

  renderTodoTree(todoListEl, roots, 0, new Set());
}

function renderStats(stats) {
  countAllEl.textContent = String(stats.total || 0);
  countActiveEl.textContent = String(stats.active || 0);
  countCompletedEl.textContent = String(stats.completed || 0);
}

function renderFilterButtons() {
  for (const button of filterButtons) {
    const selected = button.dataset.filter === state.filter;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-selected", selected ? "true" : "false");
  }
}

function renderViewModeButtons() {
  for (const button of viewModeButtons) {
    const selected = button.dataset.view === state.viewMode;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-selected", selected ? "true" : "false");
  }
}

function renderProjectSuggestions(projects) {
  projectSuggestionsEl.innerHTML = "";
  for (const project of projects) {
    const option = document.createElement("option");
    option.value = project.name;
    projectSuggestionsEl.appendChild(option);
  }
}

function renderParentOptions(parentCandidates) {
  const currentValue = parentSelectEl.value;
  parentSelectEl.innerHTML = "";

  const rootOption = document.createElement("option");
  rootOption.value = "";
  rootOption.textContent = "顶级任务（无父级）";
  parentSelectEl.appendChild(rootOption);

  if (!parentCandidates.length) {
    return;
  }

  const tree = buildTodoTree(parentCandidates);
  const fragment = document.createDocumentFragment();

  function appendOptions(nodes, depth) {
    for (const node of nodes) {
      const option = document.createElement("option");
      option.value = String(node.id);
      const prefix = depth > 0 ? `${"　".repeat(depth)}└ ` : "";
      option.textContent = `${prefix}${node.title} [${node.project || "默认项目"}]`;
      fragment.appendChild(option);

      if (node.children.length > 0) {
        appendOptions(node.children, depth + 1);
      }
    }
  }

  appendOptions(tree, 0);
  parentSelectEl.appendChild(fragment);

  if (currentValue && [...parentSelectEl.options].some((option) => option.value === currentValue)) {
    parentSelectEl.value = currentValue;
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
  setBusy(true);
  if (!silent) {
    setMessage("正在同步数据...");
  }

  try {
    const [todoPayload, metaPayload] = await Promise.all([
      requestJSON(`/api/todos?filter=${encodeURIComponent(state.filter)}`),
      requestJSON("/api/todos/meta"),
    ]);

    state.items = todoPayload.items || [];
    renderStats(todoPayload.stats || {});
    renderTodos(state.items);
    renderProjectSuggestions(metaPayload.projects || []);
    renderParentOptions(metaPayload.parents || []);
    renderFilterButtons();
    renderViewModeButtons();
    setSyncStatus("已连接");

    if (!silent) {
      setMessage(`已加载 ${state.items.length} 条记录`);
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

  const project = projectInputEl.value.trim() || "默认项目";
  const dueDate = dueDateInputEl.value || null;
  const parentId = parentSelectEl.value ? Number(parentSelectEl.value) : null;

  setBusy(true);
  setMessage("正在保存...");
  try {
    await requestJSON("/api/todos", {
      method: "POST",
      body: JSON.stringify({
        title,
        project,
        dueDate,
        parentId,
      }),
    });

    todoInputEl.value = "";
    parentSelectEl.value = "";
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

for (const button of viewModeButtons) {
  button.addEventListener("click", () => {
    if (state.busy) {
      return;
    }
    state.viewMode = button.dataset.view;
    renderViewModeButtons();
    renderTodos(state.items);
  });
}

todoFormEl.addEventListener("submit", onAddTodo);
loadTodos();
