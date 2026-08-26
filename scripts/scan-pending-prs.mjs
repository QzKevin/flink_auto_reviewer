import { Buffer } from "node:buffer";
import { comparableUrl, validateFriendInput } from "./lib/link.mjs";

const token = process.env.GITHUB_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;
const waitHours = Number(process.env.AUTO_REVIEW_AFTER_HOURS || 12);
const requireBacklink = process.env.REQUIRE_BACKLINK === "true";
const siteBaseUrl = process.env.SITE_BASE_URL || "";

if (!token) {
  throw new Error("GITHUB_TOKEN is required.");
}

if (!repository) {
  throw new Error("GITHUB_REPOSITORY is required.");
}

const [owner, repo] = repository.split("/");
const apiBase = "https://api.github.com";

async function github(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-github-api-version": "2022-11-28",
      ...(options.headers || {})
    }
  });

  if (response.status === 204) {
    return null;
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${options.method || "GET"} ${path} failed: ${response.status} ${text}`);
  }

  return response.json();
}

async function addLabel(issueNumber, label) {
  await github(`/repos/${owner}/${repo}/issues/${issueNumber}/labels`, {
    method: "POST",
    body: JSON.stringify({
      labels: [label]
    })
  });
}

async function removeLabel(issueNumber, label) {
  try {
    await github(`/repos/${owner}/${repo}/issues/${issueNumber}/labels/${encodeURIComponent(label)}`, {
      method: "DELETE"
    });
  } catch (error) {
    if (!String(error.message).includes("404")) {
      throw error;
    }
  }
}

async function comment(issueNumber, body) {
  await github(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
    method: "POST",
    body: JSON.stringify({
      body
    })
  });
}

async function closePullRequest(number) {
  await github(`/repos/${owner}/${repo}/pulls/${number}`, {
    method: "PATCH",
    body: JSON.stringify({
      state: "closed"
    })
  });
}

async function readFriendsAt(ref) {
  const payload = await github(`/repos/${owner}/${repo}/contents/data/friends.json?ref=${encodeURIComponent(ref)}`);
  const text = Buffer.from(payload.content, payload.encoding).toString("utf8");
  return JSON.parse(text);
}

function getNewEntries(baseFriends, headFriends) {
  const baseUrls = new Set(baseFriends.map((friend) => comparableUrl(friend.url)));
  return headFriends.filter((friend) => !baseUrls.has(comparableUrl(friend.url)));
}

function hasLabels(pr, names) {
  const current = new Set(pr.labels.map((label) => label.name));
  return names.every((name) => current.has(name));
}

function hasAnyLabel(pr, names) {
  const current = new Set(pr.labels.map((label) => label.name));
  return names.some((name) => current.has(name));
}

function isMature(pr) {
  const submittedAt = Date.parse(pr.created_at);
  const ageMs = Date.now() - submittedAt;
  return ageMs >= waitHours * 60 * 60 * 1000;
}

async function fetchWithTimeout(url, options = {}) {
  return fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(Number(process.env.REMOTE_CHECK_TIMEOUT_MS || 10000)),
    headers: {
      "user-agent": "flink-auto-reviewer/0.1",
      ...(options.headers || {})
    },
    ...options
  });
}

async function reviewRemoteSite(friend) {
  const errors = [];

  try {
    const response = await fetchWithTimeout(friend.url);

    if (!response.ok) {
      errors.push(`站点访问失败：HTTP ${response.status}`);
    }

    if (requireBacklink) {
      if (!siteBaseUrl) {
        errors.push("REQUIRE_BACKLINK=true 时必须配置 SITE_BASE_URL。");
      } else {
        const html = await response.text();
        const expectedHost = new URL(siteBaseUrl).hostname;

        if (!html.includes(siteBaseUrl) && !html.includes(expectedHost)) {
          errors.push(`未检测到本站反链：${siteBaseUrl}`);
        }
      }
    }
  } catch (error) {
    errors.push(`站点访问异常：${error instanceof Error ? error.message : "unknown error"}`);
  }

  if (friend.avatar) {
    try {
      const avatarResponse = await fetchWithTimeout(friend.avatar, {
        method: "GET"
      });

      if (!avatarResponse.ok) {
        errors.push(`头像访问失败：HTTP ${avatarResponse.status}`);
      }
    } catch (error) {
      errors.push(`头像访问异常：${error instanceof Error ? error.message : "unknown error"}`);
    }
  }

  return errors;
}

async function markFailed(pr, errors) {
  await addLabel(pr.number, "auto-review-failed");
  await removeLabel(pr.number, "pending-review");
  await comment(
    pr.number,
    [
      "自动审核未通过，PR 将保留给人工处理。",
      "",
      ...errors.map((error) => `- ${error}`)
    ].join("\n")
  );
}

async function mergePullRequest(pr) {
  await github(`/repos/${owner}/${repo}/pulls/${pr.number}/merge`, {
    method: "PUT",
    body: JSON.stringify({
      commit_title: `Merge friend link: #${pr.number}`,
      merge_method: "squash"
    })
  });

  await addLabel(pr.number, "auto-review-passed");
  await removeLabel(pr.number, "pending-review");
  await comment(pr.number, "自动审核通过，已 squash merge。");
}

async function reviewPullRequest(pr) {
  const baseFriends = await readFriendsAt(pr.base.ref);
  const headFriends = await readFriendsAt(pr.head.sha);
  const newEntries = getNewEntries(baseFriends, headFriends);

  if (newEntries.length === 0) {
    await addLabel(pr.number, "already-added");
    await removeLabel(pr.number, "pending-review");
    await comment(pr.number, "主分支中已经存在该友链，关闭这个待审核 PR。");
    await closePullRequest(pr.number);
    return;
  }

  if (newEntries.length !== 1) {
    await markFailed(pr, [`PR 应只新增 1 条友链，实际新增 ${newEntries.length} 条。`]);
    return;
  }

  const friend = newEntries[0];
  const validation = validateFriendInput(friend, baseFriends, {
    allowHttp: false,
    submittedAt: friend.createdAt
  });
  const remoteErrors = await reviewRemoteSite(friend);
  const errors = [...validation.errors, ...remoteErrors];

  if (errors.length > 0) {
    await markFailed(pr, errors);
    return;
  }

  await mergePullRequest(pr);
}

async function main() {
  const prs = await github(`/repos/${owner}/${repo}/pulls?state=open&per_page=100`);
  const candidates = prs.filter((pr) => {
    return (
      hasLabels(pr, ["friend-link", "pending-review", "auto-review-after-12h"]) &&
      !hasAnyLabel(pr, ["do-not-auto-merge", "needs-human-review"]) &&
      isMature(pr)
    );
  });

  console.log(`Found ${candidates.length} mature pending friend link PR(s).`);

  for (const pr of candidates) {
    try {
      console.log(`Reviewing #${pr.number}: ${pr.title}`);
      await reviewPullRequest(pr);
    } catch (error) {
      console.error(`Failed to review #${pr.number}:`, error);
      await markFailed(pr, [error instanceof Error ? error.message : "unknown error"]);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
