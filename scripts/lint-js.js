#!/usr/bin/env node
"use strict";

const path = require("path");
const { spawnSync } = require("child_process");

const ROOT_DIR = path.resolve(__dirname, "..");
const targetFiles = [
  "src/app.js",
  "src/db.js",
  "src/server.js",
  "public/app.js",
  "tests/api.test.js",
  "scripts/github-push-webhook.js",
];

let failed = false;

for (const relativeFile of targetFiles) {
  const absoluteFile = path.join(ROOT_DIR, relativeFile);
  const result = spawnSync(process.execPath, ["--check", absoluteFile], {
    stdio: "inherit",
  });
  if (result.status !== 0) {
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}

console.log(`[lint] syntax check passed for ${targetFiles.length} files`);
