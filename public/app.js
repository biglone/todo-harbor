const state = {
  filter: "all",
  viewMode: "flat",
  composeMode: "single",
  editingTodoId: null,
  searchKeyword: "",
  filterProject: "",
  dueFrom: "",
  dueTo: "",
  sort: "created_desc",
  dueScope: "all",
  page: 1,
  pageSize: 60,
  pagination: null,
  busy: false,
  items: [],
  visibleItems: [],
  projects: [],
  parents: [],
  undoAvailable: false,
};

const todoListEl = document.getElementById("todoList");
const todoFormEl = document.getElementById("todoForm");
const todoInputEl = document.getElementById("todoInput");
const todoBatchInputEl = document.getElementById("todoBatchInput");
const singleInputFieldEl = document.getElementById("singleInputField");
const batchInputFieldEl = document.getElementById("batchInputField");
const projectInputEl = document.getElementById("projectInput");
const dueDateInputEl = document.getElementById("dueDateInput");
const parentSelectEl = document.getElementById("parentSelect");
const projectSuggestionsEl = document.getElementById("projectSuggestions");
const projectChipsEl = document.getElementById("projectChips");
const addButtonEl = document.getElementById("addButton");
const resetComposerButtonEl = document.getElementById("resetComposerButton");
const messageBarEl = document.getElementById("messageBar");
const syncStatusEl = document.getElementById("syncStatus");
const templateEl = document.getElementById("todoTemplate");

const summaryModeEl = document.getElementById("summaryMode");
const summaryCountEl = document.getElementById("summaryCount");
const summaryProjectEl = document.getElementById("summaryProject");
const summaryDateEl = document.getElementById("summaryDate");
const summaryParentEl = document.getElementById("summaryParent");
const summaryHintEl = document.getElementById("summaryHint");

const countAllEl = document.getElementById("countAll");
const countActiveEl = document.getElementById("countActive");
const countCompletedEl = document.getElementById("countCompleted");
const bulkCompleteButtonEl = document.getElementById("bulkCompleteButton");
const bulkProjectButtonEl = document.getElementById("bulkProjectButton");
const bulkDueDateButtonEl = document.getElementById("bulkDueDateButton");
const exportButtonEl = document.getElementById("exportButton");
const importButtonEl = document.getElementById("importButton");
const undoButtonEl = document.getElementById("undoButton");
const clearCompletedButtonEl = document.getElementById("clearCompletedButton");
const searchInputEl = document.getElementById("searchInput");
const projectFilterSelectEl = document.getElementById("projectFilterSelect");
const dueFromInputEl = document.getElementById("dueFromInput");
const dueToInputEl = document.getElementById("dueToInput");
const sortSelectEl = document.getElementById("sortSelect");
const resetQueryButtonEl = document.getElementById("resetQueryButton");
const dueSnapshotEl = document.getElementById("dueSnapshot");
const listActionsEl = document.getElementById("listActions");
const listProgressEl = document.getElementById("listProgress");
const loadMoreButtonEl = document.getElementById("loadMoreButton");

const modalEl = document.getElementById("actionModal");
const modalFormEl = document.getElementById("modalForm");
const modalTitleEl = document.getElementById("modalTitle");
const modalDescriptionEl = document.getElementById("modalDescription");
const modalErrorEl = document.getElementById("modalError");
const modalCloseButtonEl = document.getElementById("modalCloseButton");
const modalCancelButtonEl = document.getElementById("modalCancelButton");
const modalSubmitButtonEl = document.getElementById("modalSubmitButton");
const modalProjectFieldEl = document.getElementById("modalProjectField");
const modalProjectInputEl = document.getElementById("modalProjectInput");
const modalDueDateFieldEl = document.getElementById("modalDueDateField");
const modalDueDateInputEl = document.getElementById("modalDueDateInput");
const modalImportModeFieldEl = document.getElementById("modalImportModeField");
const modalImportModeSelectEl = document.getElementById("modalImportModeSelect");
const modalImportFileFieldEl = document.getElementById("modalImportFileField");
const modalImportFileInputEl = document.getElementById("modalImportFileInput");
const modalImportTextFieldEl = document.getElementById("modalImportTextField");
const modalImportTextareaEl = document.getElementById("modalImportTextarea");

const filterButtons = document.querySelectorAll(".filter");
const dueScopeButtons = document.querySelectorAll(".due-scope");
const viewModeButtons = document.querySelectorAll(".view-mode");
const composeModeButtons = document.querySelectorAll(".compose-mode");
const quickDateButtons = document.querySelectorAll(".quick-date");

const MODAL_TYPES = {
  bulkProject: "bulkProject",
  bulkDueDate: "bulkDueDate",
  importJson: "importJson",
};

let activeModalType = null;

function setBusy(nextBusy) {
  state.busy = nextBusy;
  addButtonEl.disabled = nextBusy;
  resetComposerButtonEl.disabled = nextBusy;
  if (bulkCompleteButtonEl) {
    bulkCompleteButtonEl.disabled = nextBusy;
  }
  if (bulkProjectButtonEl) {
    bulkProjectButtonEl.disabled = nextBusy;
  }
  if (bulkDueDateButtonEl) {
    bulkDueDateButtonEl.disabled = nextBusy;
  }
  if (exportButtonEl) {
    exportButtonEl.disabled = nextBusy;
  }
  if (importButtonEl) {
    importButtonEl.disabled = nextBusy;
  }
  if (undoButtonEl) {
    undoButtonEl.disabled = nextBusy || !state.undoAvailable;
  }
  if (clearCompletedButtonEl) {
    const completedCount = Number(countCompletedEl.textContent || 0);
    clearCompletedButtonEl.disabled = nextBusy || completedCount <= 0;
  }
  if (searchInputEl) {
    searchInputEl.disabled = nextBusy;
  }
  if (projectFilterSelectEl) {
    projectFilterSelectEl.disabled = nextBusy;
  }
  if (dueFromInputEl) {
    dueFromInputEl.disabled = nextBusy;
  }
  if (dueToInputEl) {
    dueToInputEl.disabled = nextBusy;
  }
  if (sortSelectEl) {
    sortSelectEl.disabled = nextBusy;
  }
  if (resetQueryButtonEl) {
    resetQueryButtonEl.disabled = nextBusy;
  }
  if (loadMoreButtonEl && !loadMoreButtonEl.hidden) {
    loadMoreButtonEl.disabled = nextBusy;
  }
  for (const button of composeModeButtons) {
    button.disabled = nextBusy;
  }
  for (const button of dueScopeButtons) {
    button.disabled = nextBusy;
  }
  for (const button of quickDateButtons) {
    button.disabled = nextBusy;
  }
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
    return "未设置到期日";
  }

  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
  }).format(date);
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

function getNearDueBoundaryDateString(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return formatDateForInput(date);
}

function getDueStatus(dueDate) {
  if (!dueDate) {
    return "none";
  }

  const today = getTodayDateString();
  if (dueDate < today) {
    return "overdue";
  }

  if (dueDate === today) {
    return "today";
  }

  if (dueDate <= getNearDueBoundaryDateString(7)) {
    return "upcoming";
  }

  return "future";
}

function isValidDateInput(value) {
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

function getBatchTitles() {
  return String(todoBatchInputEl.value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function renderComposerActionButtons() {
  resetComposerButtonEl.textContent = state.editingTodoId ? "取消编辑" : "清空输入";

  if (state.editingTodoId) {
    addButtonEl.textContent = "保存修改";
    return;
  }

  addButtonEl.textContent = state.composeMode === "batch" ? "批量新增" : "新增待办";
}

function updateComposerSummary() {
  const project = projectInputEl.value.trim() || "默认项目";
  const dueDate = dueDateInputEl.value;
  const parentText = parentSelectEl.value
    ? parentSelectEl.options[parentSelectEl.selectedIndex]?.textContent || "顶级任务"
    : "顶级任务";

  const isBatch = state.composeMode === "batch";
  const batchTitles = isBatch ? getBatchTitles() : [];
  const plannedCount = isBatch ? batchTitles.length : 1;

  summaryModeEl.textContent = isBatch ? "批量录入" : "单条录入";
  summaryCountEl.textContent = `${plannedCount} 条`;
  summaryProjectEl.textContent = project;
  summaryDateEl.textContent = dueDate ? formatDateOnly(dueDate) : "未设置到期日";
  summaryParentEl.textContent = parentText;

  if (state.editingTodoId) {
    summaryHintEl.textContent = `正在编辑任务 #${state.editingTodoId}，保存后会覆盖原内容。`;
    return;
  }

  if (isBatch) {
    summaryHintEl.textContent =
      batchTitles.length > 0
        ? `批量模式将一次创建 ${batchTitles.length} 条任务。`
        : "批量模式下请在文本框中每行输入一条任务。";
  } else {
    summaryHintEl.textContent = "单条模式会创建 1 条任务。";
  }
}

function renderComposeModeButtons() {
  for (const button of composeModeButtons) {
    const selected = button.dataset.composeMode === state.composeMode;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-selected", selected ? "true" : "false");
  }
}

function exitEditMode({ resetFields = false } = {}) {
  state.editingTodoId = null;
  if (resetFields) {
    resetComposerFields();
  }
  renderComposerActionButtons();
  updateComposerSummary();
}

function setComposeMode(mode) {
  if (mode === "batch" && state.editingTodoId) {
    exitEditMode({ resetFields: true });
    setMessage("已退出编辑模式");
  }

  state.composeMode = mode === "batch" ? "batch" : "single";

  const isBatch = state.composeMode === "batch";
  singleInputFieldEl.classList.toggle("is-hidden", isBatch);
  batchInputFieldEl.classList.toggle("is-hidden", !isBatch);

  renderComposeModeButtons();
  renderComposerActionButtons();
  updateComposerSummary();
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

function getTodoById(id) {
  return state.items.find((item) => item.id === id) || null;
}

function onEditTodo(id) {
  if (state.busy) {
    return;
  }

  const todo = getTodoById(id);
  if (!todo) {
    setMessage("未找到待编辑任务", true);
    return;
  }

  setComposeMode("single");
  state.editingTodoId = id;
  todoInputEl.value = todo.title;
  projectInputEl.value = todo.project || "默认项目";
  dueDateInputEl.value = todo.due_date || "";

  if (todo.parent_id) {
    const parentId = String(todo.parent_id);
    const hasOption = [...parentSelectEl.options].some((option) => option.value === parentId);
    if (!hasOption) {
      const option = document.createElement("option");
      option.value = parentId;
      option.textContent = `当前父任务 #${parentId}`;
      parentSelectEl.appendChild(option);
    }
    parentSelectEl.value = parentId;
  } else {
    parentSelectEl.value = "";
  }

  renderProjectChips(state.projects);
  renderComposerActionButtons();
  updateComposerSummary();
  setMessage(`正在编辑任务 #${id}`);
  todoFormEl.scrollIntoView({ behavior: "smooth", block: "start" });
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
    const dueStatus = getDueStatus(item.due_date);
    if (dueStatus === "overdue") {
      dueDateTag.classList.add("is-overdue");
      dueDateTag.textContent = `逾期 · ${formatDateOnly(item.due_date)}`;
    } else if (dueStatus === "today") {
      dueDateTag.classList.add("is-today");
      dueDateTag.textContent = `今天 · ${formatDateOnly(item.due_date)}`;
    } else if (dueStatus === "upcoming") {
      dueDateTag.classList.add("is-upcoming");
      dueDateTag.textContent = `7天内 · ${formatDateOnly(item.due_date)}`;
    } else {
      dueDateTag.textContent = formatDateOnly(item.due_date);
    }
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

  const actionsEl = document.createElement("div");
  actionsEl.className = "todo-actions";

  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.className = "todo-action";
  editButton.textContent = "编辑";
  editButton.addEventListener("click", () => onEditTodo(item.id));
  actionsEl.appendChild(editButton);

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "todo-action is-danger";
  deleteButton.textContent = "删除";
  deleteButton.addEventListener("click", () => onDeleteTodo(item.id));
  actionsEl.appendChild(deleteButton);

  metaEl.insertAdjacentElement("afterend", actionsEl);

  toggleButton.setAttribute("aria-label", item.completed ? "标记为未完成" : "标记为已完成");
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
  if (listActionsEl) {
    listActionsEl.classList.add("is-hidden");
  }

  const emptyEl = document.createElement("div");
  emptyEl.className = "empty";

  if (state.dueScope !== "all") {
    const dueScopeLabelMap = {
      overdue: "逾期",
      today: "今日到期",
      week: "7天内到期",
      no_due: "无到期日",
    };
    emptyEl.textContent = `当前筛选条件下没有${dueScopeLabelMap[state.dueScope] || "匹配"}任务。`;
    todoListEl.appendChild(emptyEl);
    return;
  }

  emptyEl.textContent =
    state.filter === "completed"
      ? "还没有已完成的待办。"
      : "当前没有待办，开始添加你的第一条任务。";
  todoListEl.appendChild(emptyEl);
}

function renderListActions(pagination, renderedCount) {
  if (!listActionsEl || !listProgressEl || !loadMoreButtonEl) {
    return;
  }

  if (!pagination || pagination.total <= 0) {
    listActionsEl.classList.add("is-hidden");
    return;
  }

  listActionsEl.classList.remove("is-hidden");
  listProgressEl.textContent = `已显示 ${renderedCount} / ${pagination.total}`;

  const hasMore = Boolean(pagination.hasNext);
  loadMoreButtonEl.hidden = !hasMore;
  loadMoreButtonEl.disabled = state.busy || !hasMore;
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
    const key = root.due_date || "未设置到期日";
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(root);
  }

  const sortedKeys = [...groups.keys()].sort((a, b) => {
    if (a === "未设置到期日") {
      return 1;
    }
    if (b === "未设置到期日") {
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
    title.textContent = key === "未设置到期日" ? key : formatDateOnly(key);
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

function renderTodos(items, pagination) {
  todoListEl.innerHTML = "";
  state.visibleItems = items;

  if (!items.length) {
    renderEmpty();
    return;
  }

  const roots = buildTodoTree(items);
  if (state.viewMode === "project") {
    renderGroupedByProject(roots);
    renderListActions(pagination, items.length);
    return;
  }

  if (state.viewMode === "date") {
    renderGroupedByDate(roots);
    renderListActions(pagination, items.length);
    return;
  }

  renderTodoTree(todoListEl, roots, 0, new Set());
  renderListActions(pagination, items.length);
}

function renderStats(stats) {
  const total = Number(stats.total || 0);
  const active = Number(stats.active || 0);
  const completed = Number(stats.completed || 0);

  countAllEl.textContent = String(total);
  countActiveEl.textContent = String(active);
  countCompletedEl.textContent = String(completed);

  if (clearCompletedButtonEl) {
    clearCompletedButtonEl.disabled = state.busy || completed <= 0;
  }
}

function renderFilterButtons() {
  for (const button of filterButtons) {
    const selected = button.dataset.filter === state.filter;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-selected", selected ? "true" : "false");
  }
}

function renderDueScopeButtons() {
  for (const button of dueScopeButtons) {
    const selected = button.dataset.dueScope === state.dueScope;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-selected", selected ? "true" : "false");
  }
}

function renderDueSnapshot(snapshot) {
  if (!dueSnapshotEl) {
    return;
  }

  const overdue = Number(snapshot?.overdue || 0);
  const today = Number(snapshot?.today || 0);
  const upcoming = Number(snapshot?.upcoming || 0);
  const noDue = Number(snapshot?.noDue || 0);
  dueSnapshotEl.textContent = `逾期 ${overdue} · 今日到期 ${today} · 未来7天 ${upcoming} · 无到期日 ${noDue}`;
}

function renderViewModeButtons() {
  for (const button of viewModeButtons) {
    const selected = button.dataset.view === state.viewMode;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-selected", selected ? "true" : "false");
  }
}

function syncQueryStateFromControls() {
  state.searchKeyword = searchInputEl ? searchInputEl.value.trim() : "";
  state.filterProject = projectFilterSelectEl ? projectFilterSelectEl.value : "";
  state.dueFrom = dueFromInputEl ? dueFromInputEl.value : "";
  state.dueTo = dueToInputEl ? dueToInputEl.value : "";
  state.sort = sortSelectEl ? sortSelectEl.value : "created_desc";
}

function buildTodoQueryURL({ page = 1 } = {}) {
  const params = new URLSearchParams();
  params.set("filter", state.filter);
  params.set("sort", state.sort || "created_desc");
  params.set("dueScope", state.dueScope || "all");
  params.set("page", String(page));
  params.set("pageSize", String(state.pageSize || 60));

  if (state.searchKeyword) {
    params.set("q", state.searchKeyword);
  }

  if (state.filterProject) {
    params.set("project", state.filterProject);
  }

  if (state.dueFrom) {
    params.set("dueFrom", state.dueFrom);
  }

  if (state.dueTo) {
    params.set("dueTo", state.dueTo);
  }

  return `/api/todos?${params.toString()}`;
}

function renderProjectSuggestions(projects) {
  projectSuggestionsEl.innerHTML = "";
  for (const project of projects) {
    const option = document.createElement("option");
    option.value = project.name;
    projectSuggestionsEl.appendChild(option);
  }
}

function renderProjectFilterOptions(projects) {
  if (!projectFilterSelectEl) {
    return;
  }

  const currentValue = state.filterProject;
  projectFilterSelectEl.innerHTML = "";

  const allOption = document.createElement("option");
  allOption.value = "";
  allOption.textContent = "全部项目";
  projectFilterSelectEl.appendChild(allOption);

  const sorted = [...projects].sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  for (const project of sorted) {
    const option = document.createElement("option");
    option.value = project.name;
    option.textContent = `${project.name} (${project.count})`;
    projectFilterSelectEl.appendChild(option);
  }

  if (currentValue && [...projectFilterSelectEl.options].some((option) => option.value === currentValue)) {
    projectFilterSelectEl.value = currentValue;
    return;
  }

  state.filterProject = "";
  projectFilterSelectEl.value = "";
}

function renderProjectChips(projects) {
  projectChipsEl.innerHTML = "";

  const sorted = [...projects]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh-CN"))
    .slice(0, 8);

  if (!sorted.length) {
    const muted = document.createElement("span");
    muted.className = "chips-placeholder";
    muted.textContent = "暂无历史项目";
    projectChipsEl.appendChild(muted);
    return;
  }

  for (const project of sorted) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "project-chip";
    chip.textContent = project.name;
    if ((projectInputEl.value.trim() || "默认项目") === project.name) {
      chip.classList.add("is-active");
    }

    chip.addEventListener("click", () => {
      projectInputEl.value = project.name;
      renderProjectChips(state.projects);
      updateComposerSummary();
    });

    projectChipsEl.appendChild(chip);
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

function syncFieldsWithParent() {
  const selectedId = Number(parentSelectEl.value);
  if (!selectedId) {
    updateComposerSummary();
    return;
  }

  const parent = state.parents.find((item) => item.id === selectedId);
  if (!parent) {
    updateComposerSummary();
    return;
  }

  const currentProject = projectInputEl.value.trim();
  if (!currentProject || currentProject === "默认项目") {
    projectInputEl.value = parent.project || "默认项目";
  }

  if (!dueDateInputEl.value && parent.due_date) {
    dueDateInputEl.value = parent.due_date;
  }

  renderProjectChips(state.projects);
  updateComposerSummary();
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

function resetListPagination() {
  state.page = 1;
  state.pagination = null;
  state.items = [];
  state.visibleItems = [];
}

async function loadTodos({ silent = false, append = false } = {}) {
  syncQueryStateFromControls();
  if (state.dueFrom && state.dueTo && state.dueFrom > state.dueTo) {
    setMessage("筛选到期日范围无效：开始到期日不能晚于结束到期日", true);
    return;
  }

  if (!append) {
    resetListPagination();
  }

  setBusy(true);
  if (!silent) {
    setMessage(append ? "正在加载更多..." : "正在同步数据...");
  }

  try {
    const pageToLoad = append ? state.page + 1 : 1;
    const [todoPayload, metaPayload] = await Promise.all([
      requestJSON(buildTodoQueryURL({ page: pageToLoad })),
      requestJSON("/api/todos/meta"),
    ]);

    state.page = pageToLoad;
    state.pagination = todoPayload.pagination || null;

    const nextItems = Array.isArray(todoPayload.items) ? todoPayload.items : [];
    state.items = append ? [...state.items, ...nextItems] : nextItems;
    state.projects = metaPayload.projects || [];
    state.parents = metaPayload.parents || [];
    state.undoAvailable = Boolean(metaPayload.undoAvailable);

    renderStats(todoPayload.stats || {});
    renderTodos(state.items, state.pagination);
    renderDueSnapshot(todoPayload.dueSnapshot || {});
    renderProjectSuggestions(state.projects);
    renderProjectFilterOptions(state.projects);
    renderProjectChips(state.projects);
    renderParentOptions(state.parents);
    renderFilterButtons();
    renderDueScopeButtons();
    renderViewModeButtons();
    renderComposeModeButtons();
    renderComposerActionButtons();
    updateComposerSummary();
    setSyncStatus("已连接");

    if (undoButtonEl) {
      undoButtonEl.disabled = state.busy || !state.undoAvailable;
    }

    if (!silent) {
      const total = Number(todoPayload.pagination?.total || state.items.length);
      setMessage(`已加载 ${state.items.length} 条记录（总匹配 ${total}）`);
    }
  } catch (error) {
    setSyncStatus("连接异常", true);
    setMessage(error.message || "数据加载失败", true);
  } finally {
    setBusy(false);
  }
}

function resetComposerFields() {
  todoInputEl.value = "";
  todoBatchInputEl.value = "";
  dueDateInputEl.value = "";
  parentSelectEl.value = "";
  renderProjectChips(state.projects);
  updateComposerSummary();
}

async function onAddTodo(event) {
  event.preventDefault();

  const project = projectInputEl.value.trim() || "默认项目";
  const dueDate = dueDateInputEl.value || null;
  const parentId = parentSelectEl.value ? Number(parentSelectEl.value) : null;

  setBusy(true);
  setMessage("正在保存...");

  try {
    if (state.editingTodoId) {
      const title = todoInputEl.value.trim();
      if (!title) {
        throw new Error("请输入待办内容");
      }

      if (parentId && parentId === state.editingTodoId) {
        throw new Error("父任务不能选择当前任务自身");
      }

      await requestJSON(`/api/todos/${state.editingTodoId}`, {
        method: "PATCH",
        body: JSON.stringify({
          title,
          project,
          dueDate,
          parentId,
        }),
      });

      exitEditMode({ resetFields: true });
      setMessage("任务修改成功");
      await loadTodos({ silent: true });
      return;
    }

    if (state.composeMode === "batch") {
      const titles = getBatchTitles();
      if (!titles.length) {
        throw new Error("批量模式下请至少填写一条任务");
      }

      const result = await requestJSON("/api/todos/bulk", {
        method: "POST",
        body: JSON.stringify({
          titles,
          project,
          dueDate,
          parentId,
        }),
      });

      todoBatchInputEl.value = "";
      setMessage(`批量创建成功，共 ${result.count} 条`);
    } else {
      const title = todoInputEl.value.trim();
      if (!title) {
        throw new Error("请输入待办内容");
      }

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
      setMessage("保存成功");
    }

    parentSelectEl.value = "";
    await loadTodos({ silent: true });
  } catch (error) {
    setMessage(error.message || "保存失败", true);
  } finally {
    setBusy(false);
    updateComposerSummary();
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

async function onDeleteTodo(id) {
  const todo = getTodoById(id);
  if (!todo) {
    setMessage("任务不存在或已删除", true);
    return;
  }

  const confirmed = window.confirm(`确认删除「${todo.title}」吗？子任务也会一起删除。`);
  if (!confirmed) {
    return;
  }

  setBusy(true);
  setMessage("正在删除任务...");

  try {
    const result = await requestJSON(`/api/todos/${id}`, { method: "DELETE" });

    if (state.editingTodoId && Array.isArray(result.ids) && result.ids.includes(state.editingTodoId)) {
      exitEditMode({ resetFields: true });
    }

    await loadTodos({ silent: true });
    setMessage(`删除成功，共删除 ${result.count || 0} 条`);
  } catch (error) {
    setMessage(error.message || "删除失败", true);
  } finally {
    setBusy(false);
  }
}

async function onClearCompleted() {
  const completedCount = Number(countCompletedEl.textContent || 0);
  if (completedCount <= 0) {
    setMessage("当前没有已完成任务可清理");
    return;
  }

  const confirmed = window.confirm(`确认清理全部已完成任务吗？当前共 ${completedCount} 条。`);
  if (!confirmed) {
    return;
  }

  setBusy(true);
  setMessage("正在清理已完成任务...");

  try {
    const result = await requestJSON("/api/todos/completed", { method: "DELETE" });
    await loadTodos({ silent: true });
    setMessage(`已清理 ${result.count || 0} 条已完成任务`);
  } catch (error) {
    setMessage(error.message || "清理失败", true);
  } finally {
    setBusy(false);
  }
}

function getVisibleTodoIds({ activeOnly = false } = {}) {
  const base = Array.isArray(state.visibleItems) ? state.visibleItems : state.items;
  const source = activeOnly ? base.filter((item) => !item.completed) : base;
  return source.map((item) => item.id);
}

async function applyBatchUpdate(payload, pendingMessage, doneMessagePrefix) {
  setBusy(true);
  setMessage(pendingMessage);

  try {
    const result = await requestJSON("/api/todos/batch", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    await loadTodos({ silent: true });
    const skipped = Number(result.skipped || 0);
    if (skipped > 0) {
      setMessage(`${doneMessagePrefix}${result.count || 0} 条，跳过 ${skipped} 条（存在未完成子任务）`);
    } else {
      setMessage(`${doneMessagePrefix}${result.count || 0} 条`);
    }
  } catch (error) {
    setMessage(error.message || "批量操作失败", true);
  } finally {
    setBusy(false);
  }
}

function onBulkCompleteFiltered() {
  const ids = getVisibleTodoIds({ activeOnly: true });
  if (!ids.length) {
    setMessage("当前筛选结果中没有可完成任务");
    return;
  }

  const confirmed = window.confirm(`确认将当前筛选结果中的 ${ids.length} 条任务标记为已完成吗？`);
  if (!confirmed) {
    return;
  }

  applyBatchUpdate({ ids, completed: true }, "正在批量标记完成...", "已批量完成 ");
}

function onBulkProjectFiltered() {
  const ids = getVisibleTodoIds();
  if (!ids.length) {
    setMessage("当前筛选结果为空，无法批量修改");
    return;
  }

  openModal(MODAL_TYPES.bulkProject, {
    title: "批量修改项目",
    description: `将对 ${ids.length} 条任务批量修改项目。`,
    payload: { ids },
  });
}

function onBulkDueDateFiltered() {
  const ids = getVisibleTodoIds();
  if (!ids.length) {
    setMessage("当前筛选结果为空，无法批量修改");
    return;
  }

  openModal(MODAL_TYPES.bulkDueDate, {
    title: "批量修改到期日",
    description: `将对 ${ids.length} 条任务批量修改到期日。`,
    payload: { ids },
  });
}

async function onExportTodos() {
  setBusy(true);
  setMessage("正在导出...");

  try {
    const payload = await requestJSON("/api/todos/export");
    const filename = `todo-harbor-${new Date().toISOString().slice(0, 10)}.json`;
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setMessage(`已导出 ${payload.count || 0} 条任务`);
  } catch (error) {
    setMessage(error.message || "导出失败", true);
  } finally {
    setBusy(false);
  }
}

function onImportTodos() {
  openModal(MODAL_TYPES.importJson, {
    title: "导入 JSON",
    description: "支持粘贴导出的 JSON 或选择本地 JSON 文件。",
  });
}

async function onUndoLastOperation() {
  setBusy(true);
  setMessage("正在撤销...");

  try {
    const result = await requestJSON("/api/todos/undo", { method: "POST" });
    setMessage(`已撤销上一步，恢复 ${result.count || 0} 条任务`);
    await loadTodos({ silent: true });
  } catch (error) {
    setMessage(error.message || "撤销失败", true);
  } finally {
    setBusy(false);
  }
}

function resetQueryFilters() {
  if (searchInputEl) {
    searchInputEl.value = "";
  }
  if (projectFilterSelectEl) {
    projectFilterSelectEl.value = "";
  }
  if (dueFromInputEl) {
    dueFromInputEl.value = "";
  }
  if (dueToInputEl) {
    dueToInputEl.value = "";
  }
  if (sortSelectEl) {
    sortSelectEl.value = "created_desc";
  }

  syncQueryStateFromControls();
}

function setModalVisibility(isOpen) {
  if (!modalEl) {
    return;
  }

  modalEl.classList.toggle("is-hidden", !isOpen);
  modalEl.setAttribute("aria-hidden", isOpen ? "false" : "true");
}

function resetModalFields() {
  modalErrorEl.textContent = "";
  modalProjectInputEl.value = "";
  modalDueDateInputEl.value = "";
  modalImportTextareaEl.value = "";
  if (modalImportFileInputEl) {
    modalImportFileInputEl.value = "";
  }
  modalImportModeSelectEl.value = "merge";
}

function hideAllModalFields() {
  modalProjectFieldEl.classList.add("is-hidden");
  modalDueDateFieldEl.classList.add("is-hidden");
  modalImportModeFieldEl.classList.add("is-hidden");
  modalImportFileFieldEl.classList.add("is-hidden");
  modalImportTextFieldEl.classList.add("is-hidden");
}

function openModal(type, options = {}) {
  activeModalType = type;
  modalTitleEl.textContent = options.title || "操作确认";
  modalDescriptionEl.textContent = options.description || "";
  modalSubmitButtonEl.textContent = options.submitText || "确认";
  modalFormEl.dataset.payload = JSON.stringify(options.payload || {});

  resetModalFields();
  hideAllModalFields();

  if (type === MODAL_TYPES.bulkProject) {
    modalProjectFieldEl.classList.remove("is-hidden");
  }

  if (type === MODAL_TYPES.bulkDueDate) {
    modalDueDateFieldEl.classList.remove("is-hidden");
  }

  if (type === MODAL_TYPES.importJson) {
    modalImportModeFieldEl.classList.remove("is-hidden");
    modalImportFileFieldEl.classList.remove("is-hidden");
    modalImportTextFieldEl.classList.remove("is-hidden");
  }

  setModalVisibility(true);
}

function closeModal() {
  activeModalType = null;
  modalFormEl.dataset.payload = "";
  setModalVisibility(false);
}

function parseModalPayload() {
  try {
    return JSON.parse(modalFormEl.dataset.payload || "{}") || {};
  } catch (error) {
    return {};
  }
}

async function handleModalSubmit(event) {
  event.preventDefault();

  const payload = parseModalPayload();
  modalErrorEl.textContent = "";

  if (activeModalType === MODAL_TYPES.bulkProject) {
    const project = modalProjectInputEl.value.trim();
    if (!project) {
      modalErrorEl.textContent = "项目名不能为空";
      return;
    }
    if (project.length > 80) {
      modalErrorEl.textContent = "项目名不能超过 80 个字符";
      return;
    }

    closeModal();
    await applyBatchUpdate(
      { ids: payload.ids || [], project },
      "正在批量更新项目...",
      "已批量更新项目，共 ",
    );
    return;
  }

  if (activeModalType === MODAL_TYPES.bulkDueDate) {
    const dueDateRaw = modalDueDateInputEl.value.trim();
    if (dueDateRaw && !isValidDateInput(dueDateRaw)) {
      modalErrorEl.textContent = "到期日格式无效，请使用 YYYY-MM-DD";
      return;
    }

    closeModal();
    await applyBatchUpdate(
      { ids: payload.ids || [], dueDate: dueDateRaw || null },
      "正在批量更新到期日...",
      "已批量更新到期日，共 ",
    );
    return;
  }

  if (activeModalType === MODAL_TYPES.importJson) {
    const text = modalImportTextareaEl.value.trim();
    if (!text) {
      modalErrorEl.textContent = "请粘贴 JSON 内容或选择文件";
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      modalErrorEl.textContent = "JSON 格式不正确";
      return;
    }

    const mode = modalImportModeSelectEl.value || "merge";
    closeModal();
    setBusy(true);
    setMessage("正在导入...");

    try {
      const body = Array.isArray(parsed) ? parsed : { mode, items: parsed.items || parsed.todos || [] };
      const result = await requestJSON("/api/todos/import", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setMessage(`已导入 ${result.count || 0} 条任务（${result.mode === "replace" ? "替换" : "合并"}）`);
      await loadTodos({ silent: true });
    } catch (error) {
      setMessage(error.message || "导入失败", true);
    } finally {
      setBusy(false);
    }
    return;
  }
}

function handleModalBackdrop(event) {
  if (event.target?.dataset?.modalClose === "true") {
    closeModal();
  }
}

async function handleImportFileChange(event) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  try {
    const text = await file.text();
    modalImportTextareaEl.value = text.trim();
  } catch (error) {
    modalErrorEl.textContent = "读取文件失败";
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

for (const button of dueScopeButtons) {
  button.addEventListener("click", async () => {
    if (state.busy) {
      return;
    }

    state.dueScope = button.dataset.dueScope || "all";
    await loadTodos();
    setMessage(`已切换到 ${button.textContent} 视图`);
  });
}

for (const button of viewModeButtons) {
  button.addEventListener("click", () => {
    if (state.busy) {
      return;
    }

    state.viewMode = button.dataset.view;
    renderViewModeButtons();
    renderTodos(state.items, state.pagination);
  });
}

for (const button of composeModeButtons) {
  button.addEventListener("click", () => {
    if (state.busy) {
      return;
    }

    setComposeMode(button.dataset.composeMode);
  });
}

for (const button of quickDateButtons) {
  button.addEventListener("click", () => {
    if (button.dataset.clearDate === "true") {
      dueDateInputEl.value = "";
      updateComposerSummary();
      return;
    }

    const offset = Number(button.dataset.daysOffset || 0);
    const date = new Date();
    date.setDate(date.getDate() + offset);
    dueDateInputEl.value = formatDateForInput(date);
    updateComposerSummary();
  });
}

let searchDebounceTimer = null;
if (searchInputEl) {
  searchInputEl.addEventListener("input", () => {
    if (state.busy) {
      return;
    }

    if (searchDebounceTimer) {
      clearTimeout(searchDebounceTimer);
    }

    searchDebounceTimer = setTimeout(() => {
      loadTodos();
    }, 260);
  });
}

if (projectFilterSelectEl) {
  projectFilterSelectEl.addEventListener("change", () => {
    if (state.busy) {
      return;
    }
    loadTodos();
  });
}

if (dueFromInputEl) {
  dueFromInputEl.addEventListener("change", () => {
    if (state.busy) {
      return;
    }
    loadTodos();
  });
}

if (dueToInputEl) {
  dueToInputEl.addEventListener("change", () => {
    if (state.busy) {
      return;
    }
    loadTodos();
  });
}

if (sortSelectEl) {
  sortSelectEl.addEventListener("change", () => {
    if (state.busy) {
      return;
    }
    loadTodos();
  });
}

if (resetQueryButtonEl) {
  resetQueryButtonEl.addEventListener("click", () => {
    if (state.busy) {
      return;
    }
    resetQueryFilters();
    loadTodos();
  });
}

todoInputEl.addEventListener("input", updateComposerSummary);
todoBatchInputEl.addEventListener("input", updateComposerSummary);
projectInputEl.addEventListener("input", () => {
  renderProjectChips(state.projects);
  updateComposerSummary();
});
dueDateInputEl.addEventListener("input", updateComposerSummary);
parentSelectEl.addEventListener("change", syncFieldsWithParent);

resetComposerButtonEl.addEventListener("click", () => {
  if (state.editingTodoId) {
    exitEditMode({ resetFields: true });
    setMessage("已取消编辑");
    return;
  }

  resetComposerFields();
  setMessage("已清空当前输入");
});

if (clearCompletedButtonEl) {
  clearCompletedButtonEl.addEventListener("click", () => {
    if (state.busy) {
      return;
    }
    onClearCompleted();
  });
}

if (bulkCompleteButtonEl) {
  bulkCompleteButtonEl.addEventListener("click", () => {
    if (state.busy) {
      return;
    }
    onBulkCompleteFiltered();
  });
}

if (bulkProjectButtonEl) {
  bulkProjectButtonEl.addEventListener("click", () => {
    if (state.busy) {
      return;
    }
    onBulkProjectFiltered();
  });
}

if (bulkDueDateButtonEl) {
  bulkDueDateButtonEl.addEventListener("click", () => {
    if (state.busy) {
      return;
    }
    onBulkDueDateFiltered();
  });
}

if (exportButtonEl) {
  exportButtonEl.addEventListener("click", () => {
    if (state.busy) {
      return;
    }
    onExportTodos();
  });
}

if (importButtonEl) {
  importButtonEl.addEventListener("click", () => {
    if (state.busy) {
      return;
    }
    onImportTodos();
  });
}

if (undoButtonEl) {
  undoButtonEl.addEventListener("click", () => {
    if (state.busy) {
      return;
    }
    onUndoLastOperation();
  });
}

if (loadMoreButtonEl) {
  loadMoreButtonEl.addEventListener("click", () => {
    if (state.busy) {
      return;
    }

    loadTodos({ append: true });
  });
}

if (modalFormEl) {
  modalFormEl.addEventListener("submit", handleModalSubmit);
}

if (modalCloseButtonEl) {
  modalCloseButtonEl.addEventListener("click", () => {
    closeModal();
  });
}

if (modalCancelButtonEl) {
  modalCancelButtonEl.addEventListener("click", () => {
    closeModal();
  });
}

if (modalEl) {
  modalEl.addEventListener("click", handleModalBackdrop);
}

if (modalImportFileInputEl) {
  modalImportFileInputEl.addEventListener("change", handleImportFileChange);
}

todoFormEl.addEventListener("submit", onAddTodo);

setComposeMode("single");
loadTodos();
