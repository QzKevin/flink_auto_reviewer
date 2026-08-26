const token = process.env.GITHUB_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;

if (!token) {
  throw new Error("GITHUB_TOKEN is required.");
}

if (!repository) {
  throw new Error("GITHUB_REPOSITORY is required.");
}

const [owner, repo] = repository.split("/");
const apiBase = "https://api.github.com";

const labels = [
  {
    name: "friend-link",
    color: "0e8a16",
    description: "Friend link submission PR"
  },
  {
    name: "pending-review",
    color: "fbca04",
    description: "Waiting for manual review"
  },
  {
    name: "auto-review-after-12h",
    color: "1d76db",
    description: "Eligible for scheduled auto review after 12 hours"
  },
  {
    name: "already-added",
    color: "cfd3d7",
    description: "Friend link already exists on the base branch"
  },
  {
    name: "auto-review-passed",
    color: "0e8a16",
    description: "Automatic friend link review passed"
  },
  {
    name: "auto-review-failed",
    color: "d73a4a",
    description: "Automatic friend link review failed"
  },
  {
    name: "needs-human-review",
    color: "b60205",
    description: "Keep this PR for manual review"
  },
  {
    name: "do-not-auto-merge",
    color: "b60205",
    description: "Disable automatic merge for this PR"
  }
];

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

async function ensureLabel(label) {
  const encodedName = encodeURIComponent(label.name);

  try {
    await github(`/repos/${owner}/${repo}/labels/${encodedName}`, {
      method: "PATCH",
      body: JSON.stringify(label)
    });
    console.log(`Updated label: ${label.name}`);
  } catch (error) {
    if (!String(error.message).includes("404")) {
      throw error;
    }

    await github(`/repos/${owner}/${repo}/labels`, {
      method: "POST",
      body: JSON.stringify(label)
    });
    console.log(`Created label: ${label.name}`);
  }
}

for (const label of labels) {
  await ensureLabel(label);
}
