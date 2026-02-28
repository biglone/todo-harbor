#!/usr/bin/env node
"use strict";

const crypto = require("crypto");
const http = require("http");
const { spawn } = require("child_process");

const HOST = process.env.WEBHOOK_HOST || "127.0.0.1";
const PORT = Number.parseInt(process.env.WEBHOOK_PORT || "19090", 10);
const WEBHOOK_PATH = process.env.WEBHOOK_PATH || "/webhooks/github/todo-harbor";
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "";
const TARGET_REPO = process.env.WEBHOOK_TARGET_REPO || "biglone/todo-harbor";
const TARGET_REF = process.env.WEBHOOK_TARGET_REF || "refs/heads/master";
const DEPLOY_SCRIPT =
  process.env.DEPLOY_SCRIPT || "/home/Biglone/workspace/todo-harbor/scripts/auto-deploy-on-remote-update.sh";

if (!WEBHOOK_SECRET) {
  console.error("[todo-harbor:webhook] WEBHOOK_SECRET is required");
  process.exit(1);
}

let deployRunning = false;
let deployPending = false;
let pendingDeliveryId = "";

function timingSafeEqual(a, b) {
  const aBuffer = Buffer.from(a, "utf8");
  const bBuffer = Buffer.from(b, "utf8");
  if (aBuffer.length !== bBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

function verifySignature(rawBody, signatureHeader) {
  const expected = `sha256=${crypto.createHmac("sha256", WEBHOOK_SECRET).update(rawBody).digest("hex")}`;
  return timingSafeEqual(expected, String(signatureHeader || ""));
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Length", Buffer.byteLength(body));
  res.end(body);
}

function log(message, extra = {}) {
  console.log(
    JSON.stringify({
      level: "info",
      type: "deploy_webhook",
      timestamp: new Date().toISOString(),
      message,
      ...extra,
    }),
  );
}

function triggerDeploy(deliveryId) {
  deployRunning = true;
  const child = spawn(DEPLOY_SCRIPT, [], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk) => {
    process.stdout.write(chunk);
  });
  child.stderr.on("data", (chunk) => {
    process.stderr.write(chunk);
  });

  child.on("error", (error) => {
    deployRunning = false;
    log("deploy process error", { deliveryId, error: error.message });
  });

  child.on("close", (code) => {
    deployRunning = false;
    log("deploy process completed", { deliveryId, exitCode: code });

    if (!deployPending) {
      return;
    }

    const nextDeliveryId = pendingDeliveryId || `${deliveryId}-pending`;
    deployPending = false;
    pendingDeliveryId = "";
    log("pending push detected, starting follow-up deploy", {
      deliveryId: nextDeliveryId,
      previousDeliveryId: deliveryId,
    });
    triggerDeploy(nextDeliveryId);
  });
}

function handleWebhook(req, res, rawBody) {
  const deliveryId = req.headers["x-github-delivery"] || "unknown";
  const event = req.headers["x-github-event"] || "unknown";
  const signature = req.headers["x-hub-signature-256"] || "";

  if (!verifySignature(rawBody, signature)) {
    log("signature verification failed", { deliveryId, event });
    sendJson(res, 401, { ok: false, error: "invalid signature" });
    return;
  }

  let payload = {};
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch (_error) {
    sendJson(res, 400, { ok: false, error: "invalid json" });
    return;
  }

  if (event === "ping") {
    sendJson(res, 200, { ok: true, message: "pong" });
    return;
  }

  if (event !== "push") {
    sendJson(res, 202, { ok: true, ignored: true, reason: "event_not_push" });
    return;
  }

  const repo = String(payload?.repository?.full_name || "");
  const ref = String(payload?.ref || "");
  if (repo !== TARGET_REPO || ref !== TARGET_REF) {
    sendJson(res, 202, {
      ok: true,
      ignored: true,
      reason: "target_mismatch",
      repo,
      ref,
    });
    return;
  }

  if (deployRunning) {
    deployPending = true;
    pendingDeliveryId = deliveryId;
    log("deploy running, mark pending", { deliveryId, repo, ref });
    sendJson(res, 202, { ok: true, queued: true, reason: "deploy_running_pending" });
    return;
  }

  log("push event accepted", { deliveryId, repo, ref });
  triggerDeploy(deliveryId);
  sendJson(res, 202, { ok: true, queued: true });
}

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    sendJson(res, 200, { ok: true, running: deployRunning, pending: deployPending });
    return;
  }

  if (req.method !== "POST" || req.url !== WEBHOOK_PATH) {
    sendJson(res, 404, { ok: false, error: "not found" });
    return;
  }

  const chunks = [];
  let size = 0;
  req.on("data", (chunk) => {
    size += chunk.length;
    if (size > 2 * 1024 * 1024) {
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });
  req.on("end", () => {
    const rawBody = Buffer.concat(chunks);
    handleWebhook(req, res, rawBody);
  });
  req.on("error", () => {
    sendJson(res, 400, { ok: false, error: "bad request" });
  });
});

server.listen(PORT, HOST, () => {
  log("webhook listener started", {
    host: HOST,
    port: PORT,
    webhookPath: WEBHOOK_PATH,
    targetRepo: TARGET_REPO,
    targetRef: TARGET_REF,
  });
});
