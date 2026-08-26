import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { validateFriendInput } from "../scripts/lib/link.mjs";

const buckets = new Map();

function sendJson(res, status, payload) {
  res.status(status).setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function setCors(req, res) {
  const allowedOrigin = process.env.ALLOWED_ORIGIN || "*";
  const requestOrigin = req.headers.origin;

  if (allowedOrigin === "*") {
    res.setHeader("access-control-allow-origin", "*");
  } else if (!requestOrigin || requestOrigin === allowedOrigin) {
    res.setHeader("access-control-allow-origin", allowedOrigin);
  }

  res.setHeader("access-control-allow-methods", "POST, OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type");
}

function getIp(req) {
  const forwarded = req.headers["x-forwarded-for"];

  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }

  return req.socket?.remoteAddress || "unknown";
}

function rateLimit(ip) {
  const now = Date.now();
  const windowMs = 10 * 60 * 1000;
  const bucket = buckets.get(ip) ?? [];
  const fresh = bucket.filter((timestamp) => now - timestamp < windowMs);

  if (fresh.length >= 5) {
    buckets.set(ip, fresh);
    return false;
  }

  fresh.push(now);
  buckets.set(ip, fresh);
  return true;
}

function readBody(req) {
  if (typeof req.body === "object" && req.body !== null) {
    return req.body;
  }

  if (typeof req.body === "string") {
    return JSON.parse(req.body);
  }

  return {};
}

async function readExistingFriends() {
  const file = await readFile(join(process.cwd(), "data", "friends.json"), "utf8");
  return JSON.parse(file);
}

function requireGithubConfig() {
  const required = ["GITHUB_OWNER", "GITHUB_REPO", "GITHUB_TOKEN"];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    return missing;
  }

  return [];
}

async function dispatchWorkflow(payload, submissionId, submittedAt) {
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const workflowId = process.env.GITHUB_WORKFLOW_ID || "link-submit.yml";
  const ref = process.env.GITHUB_REF || "main";
  const endpoint = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      "content-type": "application/json",
      "x-github-api-version": "2022-11-28"
    },
    body: JSON.stringify({
      ref,
      inputs: {
        payload: JSON.stringify(payload),
        submissionId,
        submittedAt
      }
    })
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`GitHub workflow dispatch failed: ${response.status} ${message}`);
  }
}

export default async function handler(req, res) {
  setCors(req, res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    res.setHeader("allow", "POST, OPTIONS");
    return sendJson(res, 405, {
      ok: false,
      message: "Method Not Allowed"
    });
  }

  if (!rateLimit(getIp(req))) {
    return sendJson(res, 429, {
      ok: false,
      message: "提交太频繁，请稍后再试。"
    });
  }

  let body;
  let existingFriends;

  try {
    body = readBody(req);
    existingFriends = await readExistingFriends();
  } catch (error) {
    return sendJson(res, 400, {
      ok: false,
      message: "请求体不是合法 JSON。",
      errors: [error instanceof Error ? error.message : "Invalid JSON"]
    });
  }

  const validation = validateFriendInput(body, existingFriends, {
    allowHttp: false,
    submittedAt: new Date().toISOString()
  });

  if (!validation.ok) {
    return sendJson(res, 422, {
      ok: false,
      message: "友链信息未通过基础校验。",
      errors: validation.errors
    });
  }

  const submissionId = randomUUID();
  const submittedAt = new Date().toISOString();

  if (process.env.DRY_RUN_SUBMISSIONS === "true") {
    return sendJson(res, 202, {
      ok: true,
      dryRun: true,
      submissionId,
      message: "本次为 dry-run，未触发 GitHub Actions。"
    });
  }

  const missingConfig = requireGithubConfig();

  if (missingConfig.length > 0) {
    return sendJson(res, 503, {
      ok: false,
      message: "服务端 GitHub 配置不完整，暂时无法提交。",
      errors: missingConfig.map((key) => `Missing ${key}`)
    });
  }

  try {
    await dispatchWorkflow(validation.data, submissionId, submittedAt);

    return sendJson(res, 202, {
      ok: true,
      submissionId,
      message: "已触发 GitHub Actions，系统将创建待审核 PR。"
    });
  } catch (error) {
    return sendJson(res, 502, {
      ok: false,
      message: "触发 GitHub Actions 失败。",
      errors: [error instanceof Error ? error.message : "Unknown GitHub dispatch error"]
    });
  }
}
