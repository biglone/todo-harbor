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
  accessEnabled: false,
  authMode: "login",
  busy: false,
  items: [],
  visibleItems: [],
  projects: [],
  parents: [],
  undoAvailable: false,
  user: null,
};

function resolvePageMode(pathname) {
  if (pathname === "/auth") {
    return "auth";
  }
  if (pathname === "/settings") {
    return "settings";
  }
  return "app";
}

const PAGE_MODE = resolvePageMode(window.location.pathname);

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
const composerPanelEl = document.getElementById("composerPanel");
const metricsPanelEl = document.getElementById("metricsPanel");
const boardPanelEl = document.getElementById("boardPanel");

const authPanelEl = document.getElementById("authPanel");
const authFormEl = document.getElementById("authForm");
const authEmailEl = document.getElementById("authEmail");
const authPasswordEl = document.getElementById("authPassword");
const authPasswordConfirmFieldEl = document.getElementById("authPasswordConfirmField");
const authPasswordConfirmEl = document.getElementById("authPasswordConfirm");
const authRegisterActionsEl = document.getElementById("authRegisterActions");
const requestRegisterCodeButtonEl = document.getElementById("requestRegisterCodeButton");
const authRegisterCodeFieldEl = document.getElementById("authRegisterCodeField");
const authRegisterCodeEl = document.getElementById("authRegisterCode");
const authMessageEl = document.getElementById("authMessage");
const authSubmitButtonEl = document.getElementById("authSubmitButton");
const authModeButtons = document.querySelectorAll(".auth-mode");
const userBarEl = document.getElementById("userBar");
const userEmailEl = document.getElementById("userEmail");
const logoutButtonEl = document.getElementById("logoutButton");
const appNavLinkEl = document.getElementById("appNavLink");
const settingsNavLinkEl = document.getElementById("settingsNavLink");
const authNavLinkEl = document.getElementById("authNavLink");

const resetToggleButtonEl = document.getElementById("resetToggleButton");
const resetPanelEl = document.getElementById("resetPanel");
const resetEmailEl = document.getElementById("resetEmail");
const resetTokenEl = document.getElementById("resetToken");
const resetNewPasswordEl = document.getElementById("resetNewPassword");
const resetMessageEl = document.getElementById("resetMessage");
const requestResetButtonEl = document.getElementById("requestResetButton");
const confirmResetButtonEl = document.getElementById("confirmResetButton");

const accountPanelEl = document.getElementById("accountPanel");
const accountEmailEl = document.getElementById("accountEmail");
const verifyStatusEl = document.getElementById("verifyStatus");
const requestVerifyButtonEl = document.getElementById("requestVerifyButton");
const verifyTokenInputEl = document.getElementById("verifyTokenInput");
const verifyEmailButtonEl = document.getElementById("verifyEmailButton");
const newEmailInputEl = document.getElementById("newEmailInput");
const confirmEmailPasswordInputEl = document.getElementById("confirmEmailPasswordInput");
const changeEmailButtonEl = document.getElementById("changeEmailButton");
const currentPasswordInputEl = document.getElementById("currentPasswordInput");
const newPasswordInputEl = document.getElementById("newPasswordInput");
const changePasswordButtonEl = document.getElementById("changePasswordButton");
const accountMessageEl = document.getElementById("accountMessage");

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
const EMAIL_NOT_VERIFIED_ERROR = "Email not verified";

function requiresEmailVerification(user) {
  return Boolean(user?.requireEmailVerification);
}

function isEmailVerificationBlockedError(error) {
  const message = String(error?.message || "").trim();
  return (
    message === EMAIL_NOT_VERIFIED_ERROR ||
    message.includes(EMAIL_NOT_VERIFIED_ERROR) ||
    message.includes("邮箱未验证")
  );
}

function setEmailVerificationRequiredHint() {
  setSyncStatus("邮箱未验证", true);
  setMessage("登录成功，但邮箱未验证。请先在账号设置中完成邮箱验证。", true);
  setAccountMessage("邮箱未验证，请点击“发送验证邮件”并完成验证。", true);
}

function setBusy(nextBusy) {
  state.busy = nextBusy;
  const locked = nextBusy || !state.accessEnabled;

  addButtonEl.disabled = locked;
  resetComposerButtonEl.disabled = locked;
  if (bulkCompleteButtonEl) {
    bulkCompleteButtonEl.disabled = locked;
  }
  if (bulkProjectButtonEl) {
    bulkProjectButtonEl.disabled = locked;
  }
  if (bulkDueDateButtonEl) {
    bulkDueDateButtonEl.disabled = locked;
  }
  if (exportButtonEl) {
    exportButtonEl.disabled = locked;
  }
  if (importButtonEl) {
    importButtonEl.disabled = locked;
  }
  if (undoButtonEl) {
    undoButtonEl.disabled = locked || !state.undoAvailable;
  }
  if (clearCompletedButtonEl) {
    const completedCount = Number(countCompletedEl.textContent || 0);
    clearCompletedButtonEl.disabled = locked || completedCount <= 0;
  }
  if (searchInputEl) {
    searchInputEl.disabled = locked;
  }
  if (projectFilterSelectEl) {
    projectFilterSelectEl.disabled = locked;
  }
  if (dueFromInputEl) {
    dueFromInputEl.disabled = locked;
  }
  if (dueToInputEl) {
    dueToInputEl.disabled = locked;
  }
  if (sortSelectEl) {
    sortSelectEl.disabled = locked;
  }
  if (resetQueryButtonEl) {
    resetQueryButtonEl.disabled = locked;
  }
  if (loadMoreButtonEl && !loadMoreButtonEl.hidden) {
    loadMoreButtonEl.disabled = locked;
  }
  for (const button of composeModeButtons) {
    button.disabled = locked;
  }
  for (const button of dueScopeButtons) {
    button.disabled = locked;
  }
  for (const button of quickDateButtons) {
    button.disabled = locked;
  }
  if (requestVerifyButtonEl) {
    requestVerifyButtonEl.disabled = locked;
  }
  if (verifyEmailButtonEl) {
    verifyEmailButtonEl.disabled = locked;
  }
  if (changeEmailButtonEl) {
    changeEmailButtonEl.disabled = locked;
  }
  if (changePasswordButtonEl) {
    changePasswordButtonEl.disabled = locked;
  }
}

function setAuthBusy(isBusy) {
  if (authSubmitButtonEl) {
    authSubmitButtonEl.disabled = isBusy;
  }
  if (authEmailEl) {
    authEmailEl.disabled = isBusy;
  }
  if (authPasswordEl) {
    authPasswordEl.disabled = isBusy;
  }
  if (authPasswordConfirmEl) {
    authPasswordConfirmEl.disabled = isBusy;
  }
  if (authRegisterCodeEl) {
    authRegisterCodeEl.disabled = isBusy;
  }
  if (requestRegisterCodeButtonEl) {
    requestRegisterCodeButtonEl.disabled = isBusy;
  }
  for (const button of authModeButtons) {
    button.disabled = isBusy;
  }
}

function setMessage(text, isError = false) {
  messageBarEl.textContent = text;
  messageBarEl.classList.toggle("is-error", Boolean(isError));
}

function setAuthMessage(text) {
  authMessageEl.textContent = text || "";
}

function setResetMessage(text) {
  if (resetMessageEl) {
    resetMessageEl.textContent = text || "";
  }
}

function setAccountMessage(text, isError = false) {
  if (!accountMessageEl) {
    return;
  }
  accountMessageEl.textContent = text || "";
  accountMessageEl.classList.toggle("is-error", Boolean(isError));
}

function setSyncStatus(text, isError = false) {
  syncStatusEl.textContent = text;
  syncStatusEl.classList.toggle("is-error", Boolean(isError));
}

function updateAccountStatus(user) {
  if (!user) {
    if (accountEmailEl) {
      accountEmailEl.textContent = "-";
    }
    if (verifyStatusEl) {
      verifyStatusEl.textContent = "未验证";
      verifyStatusEl.classList.remove("is-ok");
    }
    return;
  }

  if (accountEmailEl) {
    accountEmailEl.textContent = user.email || "-";
  }
  if (verifyStatusEl) {
    const verified = Boolean(user.emailVerified);
    verifyStatusEl.textContent = verified ? "已验证" : "未验证";
    verifyStatusEl.classList.toggle("is-ok", verified);
  }
}

function updateRouteNav(enabled) {
  if (appNavLinkEl) {
    appNavLinkEl.classList.toggle("is-active", PAGE_MODE === "app");
    appNavLinkEl.classList.toggle("is-hidden", !enabled);
  }
  if (settingsNavLinkEl) {
    settingsNavLinkEl.classList.toggle("is-active", PAGE_MODE === "settings");
    settingsNavLinkEl.classList.toggle("is-hidden", !enabled);
  }
  if (authNavLinkEl) {
    authNavLinkEl.classList.toggle("is-active", PAGE_MODE === "auth");
    authNavLinkEl.classList.toggle("is-hidden", enabled);
  }
}

function updateRoutePanels(enabled) {
  const showAuth = PAGE_MODE === "auth" && !enabled;
  const showAccount = PAGE_MODE === "settings" && enabled;
  const showApp = PAGE_MODE === "app" && enabled;

  if (authPanelEl) {
    authPanelEl.classList.toggle("is-hidden", !showAuth);
  }
  if (accountPanelEl) {
    accountPanelEl.classList.toggle("is-hidden", !showAccount);
  }
  if (composerPanelEl) {
    composerPanelEl.classList.toggle("is-hidden", !showApp);
  }
  if (metricsPanelEl) {
    metricsPanelEl.classList.toggle("is-hidden", !showApp);
  }
  if (boardPanelEl) {
    boardPanelEl.classList.toggle("is-hidden", !showApp);
  }
}

function setAccessEnabled(enabled, user = null) {
  state.accessEnabled = enabled;
  state.user = user;

  updateRoutePanels(enabled);
  updateRouteNav(enabled);

  if (userBarEl) {
    userBarEl.classList.toggle("is-hidden", !enabled);
  }
  if (userEmailEl) {
    userEmailEl.textContent = enabled && user ? user.email : "";
  }

  updateAccountStatus(user);

  if (!enabled) {
    resetListPagination();
    todoListEl.innerHTML = "";
    if (listActionsEl) {
      listActionsEl.classList.add("is-hidden");
    }
    renderDueSnapshot({ overdue: 0, today: 0, upcoming: 0, noDue: 0 });
  }

  setBusy(state.busy);
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

function renderAuthModeButtons() {
  for (const button of authModeButtons) {
    const selected = button.dataset.authMode === state.authMode;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-selected", selected ? "true" : "false");
  }
}

function setAuthMode(mode) {
  state.authMode = mode === "register" ? "register" : "login";
  const isRegister = state.authMode === "register";
  renderAuthModeButtons();

  if (authPasswordConfirmFieldEl) {
    authPasswordConfirmFieldEl.classList.toggle("is-hidden", !isRegister);
  }
  if (authRegisterActionsEl) {
    authRegisterActionsEl.classList.toggle("is-hidden", !isRegister);
  }
  if (authRegisterCodeFieldEl) {
    authRegisterCodeFieldEl.classList.toggle("is-hidden", !isRegister);
  }
  if (authSubmitButtonEl) {
    authSubmitButtonEl.textContent = isRegister ? "完成注册" : "登录";
  }
  if (authPasswordEl) {
    authPasswordEl.autocomplete = isRegister ? "new-password" : "current-password";
  }
  if (resetToggleButtonEl) {
    resetToggleButtonEl.hidden = isRegister;
  }
  if (resetPanelEl && isRegister) {
    resetPanelEl.classList.add("is-hidden");
  }
  if (!isRegister && authRegisterCodeEl) {
    authRegisterCodeEl.value = "";
  }
  setAuthMessage("");
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
  loadMoreButtonEl.disabled = !state.accessEnabled || state.busy || !hasMore;
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
    clearCompletedButtonEl.disabled = !state.accessEnabled || state.busy || completed <= 0;
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
    if (response.status === 401) {
      setAccessEnabled(false, null);
      setSyncStatus("未登录", true);
      throw new Error(payload.error || "请先登录");
    }
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
  if (!state.accessEnabled) {
    return;
  }

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
    if (isEmailVerificationBlockedError(error)) {
      setEmailVerificationRequiredHint();
      return;
    }
    setSyncStatus("连接异常", true);
    setMessage(error.message || "数据加载失败", true);
  } finally {
    setBusy(false);
  }
}

async function bootstrapAuth() {
  setAuthBusy(true);
  try {
    const me = await requestJSON("/api/auth/me");
    setAccessEnabled(true, me);

    if (PAGE_MODE === "auth") {
      window.location.replace("/app");
      return;
    }

    if (requiresEmailVerification(me) && !me.emailVerified) {
      setEmailVerificationRequiredHint();
      if (PAGE_MODE !== "settings") {
        window.location.replace("/settings");
      }
      return;
    }

    setSyncStatus("已连接");
    if (PAGE_MODE === "app") {
      await loadTodos({ silent: true });
      return;
    }

    if (PAGE_MODE === "settings") {
      setAccountMessage("已登录，可在此管理账号");
    }
  } catch (error) {
    setAccessEnabled(false, null);
    setSyncStatus("未登录", true);
    if (PAGE_MODE !== "auth") {
      window.location.replace("/auth");
      return;
    }
    setMessage("请登录后使用", true);
  } finally {
    setAuthBusy(false);
  }
}

async function applyAuthTokensFromURL() {
  const params = new URLSearchParams(window.location.search);
  const verifyToken = params.get("verify_token");
  const resetToken = params.get("reset_token");
  let touched = false;

  if (resetToken && resetTokenEl) {
    resetTokenEl.value = resetToken;
    if (resetPanelEl) {
      resetPanelEl.classList.remove("is-hidden");
    }
    setResetMessage("已从邮件链接填入重置码");
    touched = true;
  }

  if (verifyToken && verifyTokenInputEl) {
    verifyTokenInputEl.value = verifyToken;
    touched = true;
  }

  if (verifyToken) {
    try {
      await requestJSON("/api/auth/verify", {
        method: "POST",
        body: JSON.stringify({ token: verifyToken }),
      });
      if (state.accessEnabled) {
        setAccountMessage("邮箱验证成功");
        const me = await requestJSON("/api/auth/me");
        setAccessEnabled(true, me);
        if (requiresEmailVerification(me) && !me.emailVerified) {
          setEmailVerificationRequiredHint();
        } else {
          setSyncStatus("已连接");
          if (PAGE_MODE === "app") {
            await loadTodos({ silent: true });
          }
        }
      } else {
        setAuthMessage("邮箱验证成功，请登录");
      }
    } catch (error) {
      if (state.accessEnabled) {
        setAccountMessage(error.message || "邮箱验证失败", true);
      } else {
        setAuthMessage(error.message || "邮箱验证失败");
      }
    }
  }

  if (touched) {
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.delete("verify_token");
    nextUrl.searchParams.delete("reset_token");
    history.replaceState({}, "", `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
  }
}

async function bootstrapApp() {
  await bootstrapAuth();
  await applyAuthTokensFromURL();
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

async function onRequestRegisterCode() {
  const email = authEmailEl.value.trim();
  if (!email) {
    setAuthMessage("请先输入邮箱");
    return;
  }

  setAuthBusy(true);
  try {
    const result = await requestJSON("/api/auth/register/code/request", {
      method: "POST",
      body: JSON.stringify({ email }),
    });

    if (result.registerCode && authRegisterCodeEl) {
      authRegisterCodeEl.value = result.registerCode;
      setAuthMessage(`验证码已发送，开发模式验证码：${result.registerCode}`);
    } else {
      setAuthMessage("验证码已发送，请检查邮箱");
    }
  } catch (error) {
    setAuthMessage(error.message || "发送验证码失败");
  } finally {
    setAuthBusy(false);
  }
}

async function onAuthSubmit(event) {
  event.preventDefault();
  setAuthMessage("");

  const email = authEmailEl.value.trim();
  const password = authPasswordEl.value;
  const confirmPassword = authPasswordConfirmEl ? authPasswordConfirmEl.value : "";
  const registerCode = authRegisterCodeEl ? authRegisterCodeEl.value.trim() : "";
  const isRegister = state.authMode === "register";

  if (!email) {
    setAuthMessage("请输入邮箱");
    return;
  }

  if (!password) {
    setAuthMessage("请输入密码");
    return;
  }

  if (isRegister) {
    if (password.length < 8) {
      setAuthMessage("密码至少 8 位");
      return;
    }
    if (password !== confirmPassword) {
      setAuthMessage("两次输入的密码不一致");
      return;
    }
    if (!registerCode) {
      setAuthMessage("请输入邮箱验证码");
      return;
    }
  }

  setAuthBusy(true);
  try {
    if (isRegister) {
      await requestJSON("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, password, code: registerCode }),
      });
      if (authPasswordEl) {
        authPasswordEl.value = "";
      }
      if (authPasswordConfirmEl) {
        authPasswordConfirmEl.value = "";
      }
      if (authRegisterCodeEl) {
        authRegisterCodeEl.value = "";
      }
      setAuthMode("login");
      setAuthMessage("注册成功，请登录");
      setMessage("注册成功，请使用邮箱和密码登录");
      setSyncStatus("未登录", true);
      return;
    }

    const user = await requestJSON("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });

    setAccessEnabled(true, user);

    if (!user.emailVerified) {
      setAccountMessage("邮箱尚未验证，可在账号设置中发送验证邮件。");
    }

    if (requiresEmailVerification(user) && !user.emailVerified) {
      setEmailVerificationRequiredHint();
      setMessage("登录成功，请先验证邮箱", true);
      if (PAGE_MODE !== "settings") {
        window.location.assign("/settings");
      }
      return;
    }

    setSyncStatus("已连接");
    if (PAGE_MODE !== "app") {
      window.location.assign("/app");
      return;
    }

    setMessage("登录成功");
    await loadTodos({ silent: true });
  } catch (error) {
    setAuthMessage(error.message || (isRegister ? "注册失败" : "登录失败"));
  } finally {
    setAuthBusy(false);
  }
}

async function onLogout() {
  setBusy(true);
  try {
    await requestJSON("/api/auth/logout", { method: "POST" });
    setAccessEnabled(false, null);
    setSyncStatus("未登录", true);
    if (PAGE_MODE !== "auth") {
      window.location.assign("/auth");
      return;
    }
    setMessage("已退出登录");
  } catch (error) {
    setMessage(error.message || "退出失败", true);
  } finally {
    setBusy(false);
  }
}

async function onRequestVerify() {
  if (!state.accessEnabled) {
    return;
  }
  setAccountMessage("正在发送验证邮件...");

  try {
    const result = await requestJSON("/api/auth/verification/request", { method: "POST" });
    if (result.emailVerified) {
      setAccountMessage("邮箱已验证");
      updateAccountStatus({ ...state.user, emailVerified: true });
      return;
    }
    if (result.verifyToken) {
      setAccountMessage(`验证邮件已发送，开发模式验证码：${result.verifyToken}`);
      if (verifyTokenInputEl) {
        verifyTokenInputEl.value = result.verifyToken;
      }
    } else {
      setAccountMessage("验证邮件已发送，请检查邮箱");
    }
  } catch (error) {
    setAccountMessage(error.message || "发送失败", true);
  }
}

async function onVerifyEmail() {
  const token = verifyTokenInputEl.value.trim();
  if (!token) {
    setAccountMessage("请输入验证码", true);
    return;
  }

  setAccountMessage("正在验证...");
  try {
    await requestJSON("/api/auth/verify", {
      method: "POST",
      body: JSON.stringify({ token }),
    });
    setAccountMessage("邮箱验证成功");
    const me = await requestJSON("/api/auth/me");
    setAccessEnabled(true, me);
    if (requiresEmailVerification(me) && !me.emailVerified) {
      setEmailVerificationRequiredHint();
      return;
    }
    setSyncStatus("已连接");
    if (PAGE_MODE === "app") {
      await loadTodos({ silent: true });
    }
  } catch (error) {
    setAccountMessage(error.message || "验证失败", true);
  }
}

async function onChangeEmail() {
  const email = newEmailInputEl.value.trim();
  const password = confirmEmailPasswordInputEl.value;

  if (!email) {
    setAccountMessage("请输入新邮箱", true);
    return;
  }
  if (!password) {
    setAccountMessage("请输入当前密码", true);
    return;
  }

  setAccountMessage("正在更新邮箱...");
  try {
    const result = await requestJSON("/api/account/email", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setAccountMessage("邮箱已更新，请完成验证");
    if (result.verifyToken && verifyTokenInputEl) {
      verifyTokenInputEl.value = result.verifyToken;
    }
    setAccessEnabled(true, {
      ...state.user,
      email: result.email,
      emailVerified: false,
    });
    newEmailInputEl.value = "";
    confirmEmailPasswordInputEl.value = "";
  } catch (error) {
    setAccountMessage(error.message || "更新失败", true);
  }
}

async function onChangePassword() {
  const currentPassword = currentPasswordInputEl.value;
  const newPassword = newPasswordInputEl.value;

  if (!currentPassword || !newPassword) {
    setAccountMessage("请输入当前密码和新密码", true);
    return;
  }
  if (newPassword.length < 8) {
    setAccountMessage("新密码至少 8 位", true);
    return;
  }

  setAccountMessage("正在更新密码...");
  try {
    await requestJSON("/api/account/password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    setAccountMessage("密码更新成功");
    currentPasswordInputEl.value = "";
    newPasswordInputEl.value = "";
  } catch (error) {
    setAccountMessage(error.message || "更新失败", true);
  }
}

async function onRequestPasswordReset() {
  const email = resetEmailEl.value.trim() || authEmailEl.value.trim();
  if (!email) {
    setResetMessage("请输入邮箱");
    return;
  }

  setResetMessage("正在发送重置码...");
  try {
    const result = await requestJSON("/api/auth/password/forgot", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
    if (result.resetToken) {
      resetTokenEl.value = result.resetToken;
      setResetMessage(`重置码已生成（开发模式）：${result.resetToken}`);
    } else {
      setResetMessage("重置码已发送，如存在该邮箱请查收");
    }
  } catch (error) {
    setResetMessage(error.message || "发送失败");
  }
}

async function onConfirmPasswordReset() {
  const token = resetTokenEl.value.trim();
  const password = resetNewPasswordEl.value;

  if (!token) {
    setResetMessage("请输入重置码");
    return;
  }
  if (!password || password.length < 8) {
    setResetMessage("新密码至少 8 位");
    return;
  }

  setResetMessage("正在重置密码...");
  try {
    await requestJSON("/api/auth/password/reset", {
      method: "POST",
      body: JSON.stringify({ token, password }),
    });
    setResetMessage("密码已重置，请使用新密码登录");
  } catch (error) {
    setResetMessage(error.message || "重置失败");
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

for (const button of authModeButtons) {
  button.addEventListener("click", () => {
    if (button.disabled) {
      return;
    }
    setAuthMode(button.dataset.authMode);
  });
}

for (const button of filterButtons) {
  button.addEventListener("click", async () => {
    if (state.busy || !state.accessEnabled) {
      return;
    }

    state.filter = button.dataset.filter;
    await loadTodos();
  });
}

for (const button of dueScopeButtons) {
  button.addEventListener("click", async () => {
    if (state.busy || !state.accessEnabled) {
      return;
    }

    state.dueScope = button.dataset.dueScope || "all";
    await loadTodos();
    setMessage(`已切换到 ${button.textContent} 视图`);
  });
}

for (const button of viewModeButtons) {
  button.addEventListener("click", () => {
    if (state.busy || !state.accessEnabled) {
      return;
    }

    state.viewMode = button.dataset.view;
    renderViewModeButtons();
    renderTodos(state.items, state.pagination);
  });
}

for (const button of composeModeButtons) {
  button.addEventListener("click", () => {
    if (state.busy || !state.accessEnabled) {
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
    if (state.busy || !state.accessEnabled) {
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
    if (state.busy || !state.accessEnabled) {
      return;
    }
    loadTodos();
  });
}

if (dueFromInputEl) {
  dueFromInputEl.addEventListener("change", () => {
    if (state.busy || !state.accessEnabled) {
      return;
    }
    loadTodos();
  });
}

if (dueToInputEl) {
  dueToInputEl.addEventListener("change", () => {
    if (state.busy || !state.accessEnabled) {
      return;
    }
    loadTodos();
  });
}

if (sortSelectEl) {
  sortSelectEl.addEventListener("change", () => {
    if (state.busy || !state.accessEnabled) {
      return;
    }
    loadTodos();
  });
}

if (resetQueryButtonEl) {
  resetQueryButtonEl.addEventListener("click", () => {
    if (state.busy || !state.accessEnabled) {
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
    if (state.busy || !state.accessEnabled) {
      return;
    }
    onClearCompleted();
  });
}

if (bulkCompleteButtonEl) {
  bulkCompleteButtonEl.addEventListener("click", () => {
    if (state.busy || !state.accessEnabled) {
      return;
    }
    onBulkCompleteFiltered();
  });
}

if (bulkProjectButtonEl) {
  bulkProjectButtonEl.addEventListener("click", () => {
    if (state.busy || !state.accessEnabled) {
      return;
    }
    onBulkProjectFiltered();
  });
}

if (bulkDueDateButtonEl) {
  bulkDueDateButtonEl.addEventListener("click", () => {
    if (state.busy || !state.accessEnabled) {
      return;
    }
    onBulkDueDateFiltered();
  });
}

if (exportButtonEl) {
  exportButtonEl.addEventListener("click", () => {
    if (state.busy || !state.accessEnabled) {
      return;
    }
    onExportTodos();
  });
}

if (importButtonEl) {
  importButtonEl.addEventListener("click", () => {
    if (state.busy || !state.accessEnabled) {
      return;
    }
    onImportTodos();
  });
}

if (undoButtonEl) {
  undoButtonEl.addEventListener("click", () => {
    if (state.busy || !state.accessEnabled) {
      return;
    }
    onUndoLastOperation();
  });
}

if (loadMoreButtonEl) {
  loadMoreButtonEl.addEventListener("click", () => {
    if (state.busy || !state.accessEnabled) {
      return;
    }

    loadTodos({ append: true });
  });
}

if (authFormEl) {
  authFormEl.addEventListener("submit", onAuthSubmit);
}

if (requestRegisterCodeButtonEl) {
  requestRegisterCodeButtonEl.addEventListener("click", () => {
    if (state.busy) {
      return;
    }
    onRequestRegisterCode();
  });
}

if (logoutButtonEl) {
  logoutButtonEl.addEventListener("click", () => {
    if (state.busy) {
      return;
    }
    onLogout();
  });
}

if (resetToggleButtonEl) {
  resetToggleButtonEl.addEventListener("click", () => {
    if (!resetPanelEl) {
      return;
    }
    resetPanelEl.classList.toggle("is-hidden");
    if (!resetPanelEl.classList.contains("is-hidden") && resetEmailEl) {
      resetEmailEl.value = authEmailEl.value.trim();
    }
  });
}

if (requestResetButtonEl) {
  requestResetButtonEl.addEventListener("click", () => {
    onRequestPasswordReset();
  });
}

if (confirmResetButtonEl) {
  confirmResetButtonEl.addEventListener("click", () => {
    onConfirmPasswordReset();
  });
}

if (requestVerifyButtonEl) {
  requestVerifyButtonEl.addEventListener("click", () => {
    if (state.busy || !state.accessEnabled) {
      return;
    }
    onRequestVerify();
  });
}

if (verifyEmailButtonEl) {
  verifyEmailButtonEl.addEventListener("click", () => {
    if (state.busy || !state.accessEnabled) {
      return;
    }
    onVerifyEmail();
  });
}

if (changeEmailButtonEl) {
  changeEmailButtonEl.addEventListener("click", () => {
    if (state.busy || !state.accessEnabled) {
      return;
    }
    onChangeEmail();
  });
}

if (changePasswordButtonEl) {
  changePasswordButtonEl.addEventListener("click", () => {
    if (state.busy || !state.accessEnabled) {
      return;
    }
    onChangePassword();
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
setAuthMode("login");
setAccessEnabled(false, null);
bootstrapApp();
