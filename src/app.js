const path = require("path");
const express = require("express");
const cookieSession = require("cookie-session");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const {
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
  dbFile,
} = require("./db");

const VALID_FILTERS = new Set(["all", "active", "completed"]);
const VALID_SORTS = new Set(["created_desc", "created_asc", "due_asc", "due_desc"]);
const VALID_DUE_SCOPES = new Set(["all", "overdue", "today", "week", "no_due"]);
const VALID_PRIORITIES = new Set(["low", "medium", "high"]);
const VALID_STATUSES = new Set(["todo", "in_progress", "blocked"]);
const VALID_RECURRENCES = new Set(["none", "daily", "weekly", "monthly"]);
const DEFAULT_PAGE_SIZE = 60;
const MAX_PAGE_SIZE = 200;
const AUTH_RATE_LIMIT_WINDOW_MS = Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 10 * 60 * 1000);
const AUTH_RATE_LIMIT_MAX = Number(process.env.AUTH_RATE_LIMIT_MAX || 120);
const AUTH_LOGIN_RATE_LIMIT_MAX = Number(process.env.AUTH_LOGIN_RATE_LIMIT_MAX || 40);
const AUTH_REGISTER_RATE_LIMIT_MAX = Number(process.env.AUTH_REGISTER_RATE_LIMIT_MAX || 30);
const AUTH_RESET_RATE_LIMIT_MAX = Number(process.env.AUTH_RESET_RATE_LIMIT_MAX || 30);
const REGISTER_CODE_TTL_MINUTES = Number(process.env.REGISTER_CODE_TTL_MINUTES || 10);
const VERIFY_TOKEN_TTL_MINUTES = Number(process.env.VERIFY_TOKEN_TTL_MINUTES || 60 * 24);
const RESET_TOKEN_TTL_MINUTES = Number(process.env.RESET_TOKEN_TTL_MINUTES || 30);
const REQUIRE_EMAIL_VERIFICATION = process.env.REQUIRE_EMAIL_VERIFICATION === "1";
const INCLUDE_TOKENS_IN_RESPONSE = process.env.NODE_ENV !== "production";
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_SECURE = process.env.SMTP_SECURE
  ? process.env.SMTP_SECURE === "true"
  : SMTP_PORT === 465;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER;
const APP_BASE_URL = process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
const PUBLIC_DIR = path.join(__dirname, "..", "public");
const PUBLIC_INDEX_FILE = path.join(PUBLIC_DIR, "index.html");

let mailTransporter = null;
const authRateLimitBuckets = new Map();

const app = express();
// Cloudflare Tunnel/reverse proxy forwards X-Forwarded-Proto for secure cookies.
app.set("trust proxy", 1);

app.use(express.json({ limit: "6mb" }));

app.use(
  cookieSession({
    name: "todo_harbor_session",
    keys: [process.env.SESSION_SECRET || "todo-harbor-dev"],
    maxAge: 1000 * 60 * 60 * 24 * 7,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
  }),
);

app.use((req, res, next) => {
  const startAt = process.hrtime.bigint();

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startAt) / 1e6;
    console.log(
      JSON.stringify({
        level: "info",
        type: "request",
        timestamp: new Date().toISOString(),
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs: Number(durationMs.toFixed(2)),
        ip: req.ip,
      }),
    );
  });

  next();
});

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    dbFile,
    timestamp: new Date().toISOString(),
  });
});

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}

function generateRegisterCode() {
  return String(crypto.randomInt(100000, 1000000));
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function addMinutes(minutes) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

function isTokenExpired(expiresAt) {
  if (!expiresAt) {
    return true;
  }
  return Date.parse(expiresAt) <= Date.now();
}

function clampRateLimitValue(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : fallback;
}

function buildAuthRateLimitKey(scope, ...parts) {
  const safeParts = parts.map((part) => String(part || "unknown").trim().toLowerCase() || "unknown");
  return [scope, ...safeParts].join(":");
}

function takeRateLimitToken(key, { limit, windowMs }) {
  const safeLimit = clampRateLimitValue(limit, AUTH_RATE_LIMIT_MAX);
  const safeWindowMs = clampRateLimitValue(windowMs, AUTH_RATE_LIMIT_WINDOW_MS);
  const now = Date.now();
  const existing = authRateLimitBuckets.get(key) || [];
  const recent = existing.filter((timestamp) => now - timestamp < safeWindowMs);

  if (recent.length >= safeLimit) {
    const retryAfterSec = Math.max(1, Math.ceil((safeWindowMs - (now - recent[0])) / 1000));
    authRateLimitBuckets.set(key, recent);
    return { allowed: false, retryAfterSec };
  }

  recent.push(now);
  authRateLimitBuckets.set(key, recent);
  return { allowed: true, retryAfterSec: 0 };
}

function clearRateLimitBucket(key) {
  authRateLimitBuckets.delete(key);
}

function checkAuthRateLimit(req, res, key, { limit, windowMs } = {}) {
  const result = takeRateLimitToken(key, { limit, windowMs });
  if (result.allowed) {
    return true;
  }

  res.set("Retry-After", String(result.retryAfterSec));
  res.status(429).json({
    error: "Too many requests, please retry later",
    retryAfterSec: result.retryAfterSec,
  });
  return false;
}

function getMailer() {
  if (!SMTP_USER || !SMTP_PASS) {
    return null;
  }

  if (mailTransporter) {
    return mailTransporter;
  }

  const host = SMTP_HOST || "smtp.gmail.com";
  mailTransporter = nodemailer.createTransport({
    host,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });

  return mailTransporter;
}

async function sendEmail({ to, subject, text, html }) {
  const transporter = getMailer();
  if (!transporter || !SMTP_FROM) {
    return { sent: false, reason: "not_configured" };
  }

  try {
    await transporter.sendMail({
      from: SMTP_FROM,
      to,
      subject,
      text,
      html,
    });
    return { sent: true };
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        type: "mail_error",
        timestamp: new Date().toISOString(),
        message: error?.message || "Email send failed",
      }),
    );
    return { sent: false, reason: "error" };
  }
}

function buildVerifyEmail(email, token) {
  const verifyUrl = `${APP_BASE_URL}/auth?verify_token=${encodeURIComponent(token)}`;
  const subject = "Todo Harbor 邮箱验证";
  const text = `你好，\\n\\n你的邮箱验证码是：${token}\\n\\n也可以点击链接完成验证：${verifyUrl}\\n\\n如果不是你本人操作，请忽略此邮件。`;
  const html = `\n    <p>你好，</p>\n    <p>你的邮箱验证码是：<strong>${token}</strong></p>\n    <p>也可以点击链接完成验证：<a href=\"${verifyUrl}\">${verifyUrl}</a></p>\n    <p>如果不是你本人操作，请忽略此邮件。</p>\n  `;
  return { to: email, subject, text, html };
}

function buildRegisterCodeEmail(email, code) {
  const subject = "Todo Harbor 注册验证码";
  const text = `你好，\n\n你的注册验证码是：${code}\n\n请输入该验证码完成注册。\n\n如果不是你本人操作，请忽略此邮件。`;
  const html = `\n    <p>你好，</p>\n    <p>你的注册验证码是：<strong>${code}</strong></p>\n    <p>请输入该验证码完成注册。</p>\n    <p>如果不是你本人操作，请忽略此邮件。</p>\n  `;
  return { to: email, subject, text, html };
}

function buildResetEmail(email, token) {
  const resetUrl = `${APP_BASE_URL}/auth?reset_token=${encodeURIComponent(token)}`;
  const subject = "Todo Harbor 密码重置";
  const text = `你好，\\n\\n你的密码重置码是：${token}\\n\\n也可以点击链接打开页面：${resetUrl}\\n\\n如果不是你本人操作，请忽略此邮件。`;
  const html = `\n    <p>你好，</p>\n    <p>你的密码重置码是：<strong>${token}</strong></p>\n    <p>也可以点击链接打开页面：<a href=\"${resetUrl}\">${resetUrl}</a></p>\n    <p>如果不是你本人操作，请忽略此邮件。</p>\n  `;
  return { to: email, subject, text, html };
}

function issueRegistrationCode(email) {
  const code = generateRegisterCode();
  const codeHash = hashToken(code);
  const expiresAt = addMinutes(REGISTER_CODE_TTL_MINUTES);
  setRegistrationCode(email, codeHash, expiresAt);
  return { code, expiresAt };
}

function issueVerificationToken(userId) {
  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = addMinutes(VERIFY_TOKEN_TTL_MINUTES);
  setVerificationToken(userId, tokenHash, expiresAt);
  return { token, expiresAt };
}

function issueResetToken(userId) {
  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = addMinutes(RESET_TOKEN_TTL_MINUTES);
  setResetToken(userId, tokenHash, expiresAt);
  return { token, expiresAt };
}

function requireAuth(req, res, next) {
  const userId = Number(req.session?.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const user = getUserById(userId);
  if (!user) {
    req.session = null;
    return res.status(401).json({ error: "Unauthorized" });
  }

  req.user = user;
  return next();
}

function requireVerified(req, res, next) {
  if (!REQUIRE_EMAIL_VERIFICATION) {
    return next();
  }

  if (!req.user?.email_verified) {
    return res.status(403).json({ error: "Email not verified" });
  }

  return next();
}

function getSessionUser(req) {
  const userId = Number(req.session?.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    return null;
  }

  const user = getUserById(userId);
  if (!user) {
    req.session = null;
    return null;
  }

  return user;
}

function buildAuthQuerySuffix(req) {
  const params = new URLSearchParams();
  const verifyToken = String(req.query?.verify_token || "").trim();
  const resetToken = String(req.query?.reset_token || "").trim();

  if (verifyToken) {
    params.set("verify_token", verifyToken);
  }
  if (resetToken) {
    params.set("reset_token", resetToken);
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}

app.post("/api/auth/register/code/request", async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const rateLimitKey = buildAuthRateLimitKey("auth_register_code", req.ip, email || "anonymous");
  if (!checkAuthRateLimit(req, res, rateLimitKey, { limit: AUTH_REGISTER_RATE_LIMIT_MAX })) {
    return;
  }

  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ error: "email is invalid" });
  }

  const existing = getUserByEmail(email);
  if (existing) {
    return res.status(409).json({ error: "email already registered" });
  }

  const registration = issueRegistrationCode(email);
  if (INCLUDE_TOKENS_IN_RESPONSE) {
    console.log(`Register code for ${email}: ${registration.code}`);
  }

  const mailResult = await sendEmail(buildRegisterCodeEmail(email, registration.code));
  if (!mailResult.sent && !INCLUDE_TOKENS_IN_RESPONSE) {
    return res.status(503).json({ error: "verification email unavailable" });
  }

  return res.json({
    ok: true,
    codeExpiresAt: registration.expiresAt,
    registerCode: INCLUDE_TOKENS_IN_RESPONSE ? registration.code : undefined,
  });
});

app.post("/api/auth/register", async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || "");
  const code = String(req.body?.code || "").trim();
  const rateLimitKey = buildAuthRateLimitKey("auth_register", req.ip, email || "anonymous");
  if (!checkAuthRateLimit(req, res, rateLimitKey, { limit: AUTH_REGISTER_RATE_LIMIT_MAX })) {
    return;
  }

  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ error: "email is invalid" });
  }

  if (!code) {
    return res.status(400).json({ error: "code is required" });
  }

  if (password.length < 8 || password.length > 72) {
    return res.status(400).json({ error: "password must be 8-72 characters" });
  }

  const existing = getUserByEmail(email);
  if (existing) {
    return res.status(409).json({ error: "email already registered" });
  }

  const registration = getRegistrationCodeByEmail(email);
  if (!registration) {
    return res.status(400).json({ error: "invalid code" });
  }

  if (isTokenExpired(registration.code_expires)) {
    clearRegistrationCodeByEmail(email);
    return res.status(400).json({ error: "code expired" });
  }

  const codeHash = hashToken(code);
  if (codeHash !== registration.code_hash) {
    return res.status(400).json({ error: "invalid code" });
  }

  clearRegistrationCodeByEmail(email);

  const isFirstUser = countUsers() === 0;
  const passwordHash = bcrypt.hashSync(password, 10);
  const user = createUser({ email, passwordHash, emailVerified: true });

  if (isFirstUser) {
    claimUnownedTodos(user.id);
  }

  return res.status(201).json({
    id: user.id,
    email: user.email,
    emailVerified: true,
    requireEmailVerification: REQUIRE_EMAIL_VERIFICATION,
    created_at: user.created_at,
  });
});

app.post("/api/auth/login", (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || "");
  const rateLimitKey = buildAuthRateLimitKey("auth_login", req.ip, email || "anonymous");
  if (!checkAuthRateLimit(req, res, rateLimitKey, { limit: AUTH_LOGIN_RATE_LIMIT_MAX })) {
    return;
  }

  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ error: "email is invalid" });
  }

  if (!password) {
    return res.status(400).json({ error: "password is required" });
  }

  const user = getUserByEmail(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: "invalid credentials" });
  }

  req.session.userId = user.id;
  req.session.email = user.email;
  clearRateLimitBucket(rateLimitKey);

  return res.json({
    id: user.id,
    email: user.email,
    emailVerified: Boolean(user.email_verified),
    requireEmailVerification: REQUIRE_EMAIL_VERIFICATION,
    created_at: user.created_at,
  });
});

app.post("/api/auth/logout", (req, res) => {
  req.session = null;
  return res.json({ ok: true });
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  return res.json({
    id: req.user.id,
    email: req.user.email,
    emailVerified: Boolean(req.user.email_verified),
    requireEmailVerification: REQUIRE_EMAIL_VERIFICATION,
    created_at: req.user.created_at,
  });
});

app.post("/api/auth/verification/request", requireAuth, async (req, res) => {
  const rateLimitKey = buildAuthRateLimitKey("auth_verify_request", req.ip, req.user?.email || req.user?.id);
  if (!checkAuthRateLimit(req, res, rateLimitKey, { limit: AUTH_RATE_LIMIT_MAX })) {
    return;
  }

  if (req.user.email_verified) {
    return res.json({ emailVerified: true });
  }

  const verification = issueVerificationToken(req.user.id);
  if (INCLUDE_TOKENS_IN_RESPONSE) {
    console.log(`Verify token for ${req.user.email}: ${verification.token}`);
  }
  await sendEmail(buildVerifyEmail(req.user.email, verification.token));

  return res.json({
    emailVerified: false,
    verifyToken: INCLUDE_TOKENS_IN_RESPONSE ? verification.token : undefined,
    verifyExpiresAt: INCLUDE_TOKENS_IN_RESPONSE ? verification.expiresAt : undefined,
  });
});

app.post("/api/auth/verify", (req, res) => {
  const token = String(req.body?.token || "").trim();
  const rateLimitKey = buildAuthRateLimitKey("auth_verify", req.ip);
  if (!checkAuthRateLimit(req, res, rateLimitKey, { limit: AUTH_RATE_LIMIT_MAX })) {
    return;
  }

  if (!token) {
    return res.status(400).json({ error: "token is required" });
  }

  const tokenHash = hashToken(token);
  const user = getUserByVerifyTokenHash(tokenHash);
  if (!user) {
    return res.status(400).json({ error: "invalid token" });
  }

  if (isTokenExpired(user.verify_token_expires)) {
    return res.status(400).json({ error: "token expired" });
  }

  markEmailVerified(user.id);
  return res.json({ ok: true });
});

app.post("/api/auth/password/forgot", async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const rateLimitKey = buildAuthRateLimitKey("auth_password_forgot", req.ip, email || "anonymous");
  if (!checkAuthRateLimit(req, res, rateLimitKey, { limit: AUTH_RESET_RATE_LIMIT_MAX })) {
    return;
  }

  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ error: "email is invalid" });
  }

  const user = getUserByEmail(email);
  if (!user) {
    return res.json({ ok: true });
  }

  const reset = issueResetToken(user.id);
  if (INCLUDE_TOKENS_IN_RESPONSE) {
    console.log(`Reset token for ${user.email}: ${reset.token}`);
  }
  await sendEmail(buildResetEmail(user.email, reset.token));

  return res.json({
    ok: true,
    resetToken: INCLUDE_TOKENS_IN_RESPONSE ? reset.token : undefined,
    resetExpiresAt: INCLUDE_TOKENS_IN_RESPONSE ? reset.expiresAt : undefined,
  });
});

app.post("/api/auth/password/reset", (req, res) => {
  const token = String(req.body?.token || "").trim();
  const newPassword = String(req.body?.password || "");
  const rateLimitKey = buildAuthRateLimitKey("auth_password_reset", req.ip);
  if (!checkAuthRateLimit(req, res, rateLimitKey, { limit: AUTH_RESET_RATE_LIMIT_MAX })) {
    return;
  }

  if (!token) {
    return res.status(400).json({ error: "token is required" });
  }

  if (newPassword.length < 8 || newPassword.length > 72) {
    return res.status(400).json({ error: "password must be 8-72 characters" });
  }

  const tokenHash = hashToken(token);
  const user = getUserByResetTokenHash(tokenHash);
  if (!user) {
    return res.status(400).json({ error: "invalid token" });
  }

  if (isTokenExpired(user.reset_token_expires)) {
    return res.status(400).json({ error: "token expired" });
  }

  const passwordHash = bcrypt.hashSync(newPassword, 10);
  updateUserPassword(user.id, passwordHash);
  clearResetToken(user.id);

  return res.json({ ok: true });
});

app.get("/api/account", requireAuth, (req, res) => {
  return res.json({
    id: req.user.id,
    email: req.user.email,
    emailVerified: Boolean(req.user.email_verified),
    requireEmailVerification: REQUIRE_EMAIL_VERIFICATION,
    created_at: req.user.created_at,
  });
});

app.post("/api/account/email", requireAuth, async (req, res) => {
  const rateLimitKey = buildAuthRateLimitKey("account_email_update", req.ip, req.user?.id);
  if (!checkAuthRateLimit(req, res, rateLimitKey, { limit: AUTH_RATE_LIMIT_MAX })) {
    return;
  }

  const nextEmail = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || "");

  if (!nextEmail || !isValidEmail(nextEmail)) {
    return res.status(400).json({ error: "email is invalid" });
  }

  if (!password) {
    return res.status(400).json({ error: "password is required" });
  }

  const current = getUserByEmail(req.user.email);
  if (!current || !bcrypt.compareSync(password, current.password_hash)) {
    return res.status(401).json({ error: "invalid credentials" });
  }

  const exists = getUserByEmail(nextEmail);
  if (exists && exists.id !== req.user.id) {
    return res.status(409).json({ error: "email already registered" });
  }

  const updated = updateUserEmail(req.user.id, nextEmail);
  req.session.email = updated.email;

  const verification = issueVerificationToken(updated.id);
  if (INCLUDE_TOKENS_IN_RESPONSE) {
    console.log(`Verify token for ${updated.email}: ${verification.token}`);
  }
  await sendEmail(buildVerifyEmail(updated.email, verification.token));

  return res.json({
    id: updated.id,
    email: updated.email,
    emailVerified: false,
    verifyToken: INCLUDE_TOKENS_IN_RESPONSE ? verification.token : undefined,
    verifyExpiresAt: INCLUDE_TOKENS_IN_RESPONSE ? verification.expiresAt : undefined,
  });
});

app.post("/api/account/password", requireAuth, (req, res) => {
  const rateLimitKey = buildAuthRateLimitKey("account_password_update", req.ip, req.user?.id);
  if (!checkAuthRateLimit(req, res, rateLimitKey, { limit: AUTH_RATE_LIMIT_MAX })) {
    return;
  }

  const currentPassword = String(req.body?.currentPassword || "");
  const newPassword = String(req.body?.newPassword || "");

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "currentPassword and newPassword are required" });
  }

  if (newPassword.length < 8 || newPassword.length > 72) {
    return res.status(400).json({ error: "password must be 8-72 characters" });
  }

  const current = getUserByEmail(req.user.email);
  if (!current || !bcrypt.compareSync(currentPassword, current.password_hash)) {
    return res.status(401).json({ error: "invalid credentials" });
  }

  const passwordHash = bcrypt.hashSync(newPassword, 10);
  updateUserPassword(req.user.id, passwordHash);

  return res.json({ ok: true });
});

app.use("/api/todos", requireAuth, requireVerified);

app.get("/api/todos", (req, res) => {
  const filter = String(req.query.filter || "all");
  if (!VALID_FILTERS.has(filter)) {
    return res.status(400).json({
      error: "Invalid filter. Allowed values: all, active, completed",
    });
  }

  const keyword = String(req.query.q || "").trim();
  const project = String(req.query.project || "").trim();
  const priority = String(req.query.priority || "").trim().toLowerCase();
  const status = String(req.query.status || "").trim().toLowerCase();
  const dueFrom = String(req.query.dueFrom || "").trim();
  const dueTo = String(req.query.dueTo || "").trim();
  const sort = String(req.query.sort || "created_desc").trim();
  const dueScope = String(req.query.dueScope || "all").trim();

  if (dueFrom && !isValidDateString(dueFrom)) {
    return res.status(400).json({
      error: "dueFrom must be a valid date in YYYY-MM-DD format",
    });
  }

  if (dueTo && !isValidDateString(dueTo)) {
    return res.status(400).json({
      error: "dueTo must be a valid date in YYYY-MM-DD format",
    });
  }

  if (dueFrom && dueTo && dueFrom > dueTo) {
    return res.status(400).json({
      error: "dueFrom cannot be later than dueTo",
    });
  }

  if (!VALID_SORTS.has(sort)) {
    return res.status(400).json({
      error: "Invalid sort. Allowed values: created_desc, created_asc, due_asc, due_desc",
    });
  }

  if (!VALID_DUE_SCOPES.has(dueScope)) {
    return res.status(400).json({
      error: "Invalid dueScope. Allowed values: all, overdue, today, week, no_due",
    });
  }

  if (priority && !VALID_PRIORITIES.has(priority)) {
    return res.status(400).json({
      error: "Invalid priority. Allowed values: low, medium, high",
    });
  }

  if (status && !VALID_STATUSES.has(status)) {
    return res.status(400).json({
      error: "Invalid status. Allowed values: todo, in_progress, blocked",
    });
  }

  const page = parsePositiveInteger(req.query.page, {
    field: "page",
    defaultValue: 1,
    min: 1,
    max: 100000,
  });
  if (page.error) {
    return res.status(400).json({ error: page.error });
  }

  const pageSize = parsePositiveInteger(req.query.pageSize, {
    field: "pageSize",
    defaultValue: DEFAULT_PAGE_SIZE,
    min: 1,
    max: MAX_PAGE_SIZE,
  });
  if (pageSize.error) {
    return res.status(400).json({ error: pageSize.error });
  }

  const result = listTodos({
    userId: req.user.id,
    filter,
    project,
    keyword,
    priority,
    status,
    dueFrom,
    dueTo,
    sort,
    dueScope,
    page: page.value,
    pageSize: pageSize.value,
  });

  return res.json({
    filter,
    dueScope,
    stats: getStats(req.user.id),
    pagination: result.pagination,
    dueSnapshot: result.dueSnapshot,
    items: result.items,
  });
});

app.get("/api/todos/meta", (req, res) => {
  return res.json({
    projects: listProjects(req.user.id),
    parents: listParentCandidates(req.user.id),
    undoAvailable: hasUndoSnapshot(req.user.id),
  });
});

app.get("/api/todos/export", (req, res) => {
  const items = exportTodos(req.user.id);
  return res.json({
    count: items.length,
    exportedAt: new Date().toISOString(),
    items,
  });
});

app.post("/api/todos/import", (req, res) => {
  const isRawArray = Array.isArray(req.body);
  const mode = isRawArray ? "merge" : String(req.body?.mode || "merge");
  const items = isRawArray ? req.body : req.body?.items;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      error: "items is required and must be a non-empty array",
    });
  }

  if (items.length > 5000) {
    return res.status(400).json({
      error: "items cannot exceed 5000 records per request",
    });
  }

  try {
    const result = importTodos(req.user.id, { items, mode });
    return res.status(201).json({
      ...result,
      stats: getStats(req.user.id),
    });
  } catch (error) {
    return res.status(400).json({
      error: error.message || "Import failed",
    });
  }
});

app.post("/api/todos/undo", (req, res) => {
  const result = undoLastOperation(req.user.id);
  if (!result.restored) {
    return res.status(409).json({
      error: "No undo snapshot available",
    });
  }

  return res.json({
    ...result,
    stats: getStats(req.user.id),
  });
});

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

  const [datePart, timePart] = value.split("T");
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

function parsePositiveInteger(rawValue, { field, defaultValue, min, max }) {
  if (rawValue === undefined || rawValue === null || rawValue === "") {
    return { value: defaultValue };
  }

  const text = String(rawValue).trim();
  if (!/^\d+$/.test(text)) {
    return {
      error: `${field} must be a positive integer`,
    };
  }

  const value = Number.parseInt(text, 10);
  if (!Number.isInteger(value) || value < min || value > max) {
    return {
      error: `${field} must be between ${min} and ${max}`,
    };
  }

  return { value };
}

function parseTodoInput(body, userId, { titleRequired = true } = {}) {
  const title = String(body?.title || "").trim();
  if (titleRequired && !title) {
    return { error: "title is required" };
  }

  if (title && title.length > 200) {
    return { error: "title cannot exceed 200 characters" };
  }

  const project = String(body?.project || "").trim() || "默认项目";
  if (project.length > 80) {
    return { error: "project cannot exceed 80 characters" };
  }

  const dueDateRaw = String(body?.dueDate || "").trim();
  if (dueDateRaw && !isValidDateString(dueDateRaw)) {
    return { error: "dueDate must be a valid date in YYYY-MM-DD format" };
  }

  const reminderAtRaw = String(body?.reminderAt || "").trim();
  if (reminderAtRaw && !isValidDateTimeString(reminderAtRaw)) {
    return { error: "reminderAt must be a valid datetime in YYYY-MM-DDTHH:mm format" };
  }

  const priority = String(body?.priority || "medium")
    .trim()
    .toLowerCase();
  if (!VALID_PRIORITIES.has(priority)) {
    return { error: "priority must be one of: low, medium, high" };
  }

  const status = String(body?.status || "todo")
    .trim()
    .toLowerCase();
  if (!VALID_STATUSES.has(status)) {
    return { error: "status must be one of: todo, in_progress, blocked" };
  }

  const recurrence = String(body?.recurrence || "none")
    .trim()
    .toLowerCase();
  if (!VALID_RECURRENCES.has(recurrence)) {
    return { error: "recurrence must be one of: none, daily, weekly, monthly" };
  }
  if (recurrence !== "none" && !dueDateRaw) {
    return { error: "dueDate is required when recurrence is enabled" };
  }

  const parsedTags = parseTodoTagsInput(body?.tags);
  if (parsedTags.error) {
    return parsedTags;
  }

  let parentId = null;
  if (body?.parentId !== undefined && body?.parentId !== null && body?.parentId !== "") {
    parentId = Number(body.parentId);
    if (!Number.isInteger(parentId) || parentId <= 0) {
      return { error: "parentId must be a positive integer" };
    }

    const parentTodo = getTodo(userId, parentId);
    if (!parentTodo) {
      return { error: "parentId does not exist" };
    }

    if (parentTodo.completed) {
      return { error: "parentId must be an active task" };
    }
  }

  return {
    value: {
      title,
      project,
      dueDate: dueDateRaw || null,
      reminderAt: reminderAtRaw || null,
      parentId,
      priority,
      status,
      recurrence,
      tags: parsedTags.value,
    },
  };
}

function parseTodoTagsInput(rawTags) {
  if (rawTags === undefined || rawTags === null) {
    return { value: [] };
  }

  let source = [];
  if (Array.isArray(rawTags)) {
    source = rawTags;
  } else if (typeof rawTags === "string") {
    source = rawTags.split(",");
  } else {
    return { error: "tags must be a string or string[]" };
  }

  const deduped = [];
  const seen = new Set();
  for (const raw of source) {
    const tag = String(raw || "")
      .trim()
      .replace(/^#/, "")
      .slice(0, 20);

    if (!tag) {
      continue;
    }

    const key = tag.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(tag);
    if (deduped.length > 20) {
      return { error: "tags cannot exceed 20 items" };
    }
  }

  return { value: deduped };
}

function hasParentLoop(userId, todoId, nextParentId) {
  if (!nextParentId) {
    return false;
  }

  const visited = new Set([todoId]);
  let currentId = nextParentId;

  while (currentId) {
    if (visited.has(currentId)) {
      return true;
    }

    visited.add(currentId);
    const current = getTodo(userId, currentId);
    if (!current || !current.parent_id) {
      return false;
    }

    currentId = current.parent_id;
  }

  return false;
}

function parseTodoUpdateInput(body, userId, existingTodo) {
  const normalized = {
    title: body?.title ?? existingTodo.title,
    project: body?.project ?? existingTodo.project,
    dueDate: body?.dueDate !== undefined ? body?.dueDate : existingTodo.due_date,
    reminderAt: body?.reminderAt !== undefined ? body?.reminderAt : existingTodo.reminder_at,
    parentId: body?.parentId !== undefined ? body?.parentId : existingTodo.parent_id,
    priority: body?.priority ?? existingTodo.priority,
    status: body?.status ?? existingTodo.status,
    recurrence: body?.recurrence ?? existingTodo.recurrence,
    tags: body?.tags !== undefined ? body?.tags : existingTodo.tags,
  };

  const parsed = parseTodoInput(normalized, userId);
  if (parsed.error) {
    return parsed;
  }

  if (parsed.value.parentId === existingTodo.id) {
    return {
      error: "parentId cannot be self",
    };
  }

  if (hasParentLoop(userId, existingTodo.id, parsed.value.parentId)) {
    return {
      error: "parentId would create a cycle",
    };
  }

  return parsed;
}

app.post("/api/todos", (req, res) => {
  const parsed = parseTodoInput(req.body, req.user.id);
  if (parsed.error) {
    return res.status(400).json({
      error: parsed.error,
    });
  }

  const todo = createTodo(req.user.id, parsed.value);
  return res.status(201).json(todo);
});

app.post("/api/todos/bulk", (req, res) => {
  const rawTitles = Array.isArray(req.body?.titles) ? req.body.titles : [];
  if (!rawTitles.length) {
    return res.status(400).json({
      error: "titles is required and must be a non-empty array",
    });
  }

  if (rawTitles.length > 50) {
    return res.status(400).json({
      error: "titles cannot exceed 50 items per request",
    });
  }

  const baseParsed = parseTodoInput(
    {
      ...req.body,
      title: "placeholder",
    },
    req.user.id,
    { titleRequired: false },
  );

  if (baseParsed.error) {
    return res.status(400).json({
      error: baseParsed.error,
    });
  }

  const items = [];
  for (const rawTitle of rawTitles) {
    const title = String(rawTitle || "").trim();
    if (!title) {
      continue;
    }

    if (title.length > 200) {
      return res.status(400).json({
        error: "Each title cannot exceed 200 characters",
      });
    }

    items.push({
      title,
      project: baseParsed.value.project,
      dueDate: baseParsed.value.dueDate,
      reminderAt: baseParsed.value.reminderAt,
      parentId: baseParsed.value.parentId,
      priority: baseParsed.value.priority,
      status: baseParsed.value.status,
      recurrence: baseParsed.value.recurrence,
      tags: baseParsed.value.tags,
    });
  }

  if (!items.length) {
    return res.status(400).json({
      error: "No valid titles provided after trimming",
    });
  }

  const created = createTodosBulk(req.user.id, items);
  return res.status(201).json({
    count: created.length,
    items: created,
  });
});

app.post("/api/todos/batch", (req, res) => {
  const rawIds = Array.isArray(req.body?.ids) ? req.body.ids : [];
  if (!rawIds.length) {
    return res.status(400).json({
      error: "ids is required and must be a non-empty array",
    });
  }

  if (rawIds.length > 500) {
    return res.status(400).json({
      error: "ids cannot exceed 500 items per request",
    });
  }

  const ids = [...new Set(rawIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
  if (!ids.length) {
    return res.status(400).json({
      error: "No valid ids provided",
    });
  }

  const payload = { ids };
  let hasOperation = false;

  if (req.body?.completed !== undefined) {
    if (typeof req.body.completed !== "boolean") {
      return res.status(400).json({
        error: "completed must be boolean",
      });
    }
    payload.completed = req.body.completed;
    hasOperation = true;
  }

  if (req.body?.project !== undefined) {
    const project = String(req.body.project || "").trim();
    if (!project) {
      return res.status(400).json({
        error: "project cannot be empty",
      });
    }
    if (project.length > 80) {
      return res.status(400).json({
        error: "project cannot exceed 80 characters",
      });
    }
    payload.project = project;
    hasOperation = true;
  }

  if (req.body?.dueDate !== undefined) {
    const dueDateRaw = req.body.dueDate === null ? "" : String(req.body.dueDate || "").trim();
    if (dueDateRaw && !isValidDateString(dueDateRaw)) {
      return res.status(400).json({
        error: "dueDate must be a valid date in YYYY-MM-DD format",
      });
    }
    payload.dueDate = dueDateRaw || null;
    hasOperation = true;
  }

  if (req.body?.reminderAt !== undefined) {
    const reminderAtRaw = req.body.reminderAt === null ? "" : String(req.body.reminderAt || "").trim();
    if (reminderAtRaw && !isValidDateTimeString(reminderAtRaw)) {
      return res.status(400).json({
        error: "reminderAt must be a valid datetime in YYYY-MM-DDTHH:mm format",
      });
    }
    payload.reminderAt = reminderAtRaw || null;
    hasOperation = true;
  }

  if (req.body?.priority !== undefined) {
    const priority = String(req.body.priority || "")
      .trim()
      .toLowerCase();
    if (!VALID_PRIORITIES.has(priority)) {
      return res.status(400).json({
        error: "priority must be one of: low, medium, high",
      });
    }
    payload.priority = priority;
    hasOperation = true;
  }

  if (req.body?.status !== undefined) {
    const status = String(req.body.status || "")
      .trim()
      .toLowerCase();
    if (!VALID_STATUSES.has(status)) {
      return res.status(400).json({
        error: "status must be one of: todo, in_progress, blocked",
      });
    }
    payload.status = status;
    hasOperation = true;
  }

  if (req.body?.recurrence !== undefined) {
    const recurrence = String(req.body.recurrence || "")
      .trim()
      .toLowerCase();
    if (!VALID_RECURRENCES.has(recurrence)) {
      return res.status(400).json({
        error: "recurrence must be one of: none, daily, weekly, monthly",
      });
    }
    if (recurrence !== "none") {
      if (req.body?.dueDate === undefined) {
        return res.status(400).json({
          error: "dueDate is required when setting recurrence in batch",
        });
      }
      if (payload.dueDate === null || !payload.dueDate) {
        return res.status(400).json({
          error: "dueDate cannot be empty when recurrence is enabled",
        });
      }
    }
    payload.recurrence = recurrence;
    hasOperation = true;
  }

  if (req.body?.tags !== undefined) {
    const parsedTags = parseTodoTagsInput(req.body.tags);
    if (parsedTags.error) {
      return res.status(400).json({
        error: parsedTags.error,
      });
    }
    payload.tags = parsedTags.value;
    hasOperation = true;
  }

  if (!hasOperation) {
    return res.status(400).json({
      error:
        "At least one operation is required: completed, project, dueDate, reminderAt, priority, status, recurrence, or tags",
    });
  }

  const result = updateTodosBatch(req.user.id, payload);
  return res.json({
    ...result,
    skipped: ids.length - result.count,
  });
});

app.delete("/api/todos/completed", (req, res) => {
  const count = clearCompletedTodos(req.user.id);
  return res.json({
    count,
  });
});

app.delete("/api/todos/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({
      error: "id must be a positive integer",
    });
  }

  const existingTodo = getTodo(req.user.id, id);
  if (!existingTodo) {
    return res.status(404).json({
      error: "Todo not found",
    });
  }

  const deleted = deleteTodoTree(req.user.id, id);
  return res.json(deleted);
});

app.patch("/api/todos/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({
      error: "id must be a positive integer",
    });
  }

  const existingTodo = getTodo(req.user.id, id);
  if (!existingTodo) {
    return res.status(404).json({
      error: "Todo not found",
    });
  }

  const parsed = parseTodoUpdateInput(req.body, req.user.id, existingTodo);
  if (parsed.error) {
    return res.status(400).json({
      error: parsed.error,
    });
  }

  const todo = updateTodo(req.user.id, id, parsed.value);
  return res.json(todo);
});

app.patch("/api/todos/:id/toggle", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({
      error: "id must be a positive integer",
    });
  }

  const existingTodo = getTodo(req.user.id, id);
  if (!existingTodo) {
    return res.status(404).json({
      error: "Todo not found",
    });
  }

  if (!existingTodo.completed && hasActiveChildren(req.user.id, id)) {
    return res.status(400).json({
      error: "Cannot mark a task complete while it still has active child tasks",
    });
  }

  const todo = toggleTodo(req.user.id, id);
  return res.json(todo);
});

app.get("/", (req, res) => {
  const user = getSessionUser(req);
  return res.redirect(user ? "/app" : "/auth");
});

app.get("/auth", (req, res) => {
  const user = getSessionUser(req);
  if (user) {
    return res.redirect(`/app${buildAuthQuerySuffix(req)}`);
  }
  return res.sendFile(PUBLIC_INDEX_FILE);
});

app.get("/app", (req, res) => {
  const user = getSessionUser(req);
  if (!user) {
    return res.redirect(`/auth${buildAuthQuerySuffix(req)}`);
  }
  return res.sendFile(PUBLIC_INDEX_FILE);
});

app.get("/settings", (req, res) => {
  const user = getSessionUser(req);
  if (!user) {
    return res.redirect(`/auth${buildAuthQuerySuffix(req)}`);
  }
  return res.sendFile(PUBLIC_INDEX_FILE);
});

app.use(express.static(PUBLIC_DIR));

app.use((err, req, res, _next) => {
  console.error(
    JSON.stringify({
      level: "error",
      type: "unhandled_error",
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.originalUrl,
      message: err?.message || "Unknown Error",
      stack: typeof err?.stack === "string" ? err.stack.split("\n").slice(0, 8).join("\n") : undefined,
    }),
  );

  res.status(500).json({
    error: "Internal Server Error",
  });
});

module.exports = app;
