const MAX_NAME_LENGTH = 60;
const MAX_DESCRIPTION_LENGTH = 120;
const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /\.localhost$/i,
  /\.local$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./
];

function cleanText(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function isPrivateIpv4(hostname) {
  const parts = hostname.split(".").map((part) => Number(part));

  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
    return false;
  }

  return parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31;
}

function isBlockedHostname(hostname) {
  const lower = hostname.toLowerCase();

  if (lower === "::1" || lower === "[::1]") {
    return true;
  }

  return PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(lower)) || isPrivateIpv4(lower);
}

export function normalizeUrl(value, options = {}) {
  const errors = [];
  const raw = cleanText(value);

  if (!raw) {
    return {
      value: "",
      errors: ["URL 不能为空。"]
    };
  }

  const withProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  let parsed;

  try {
    parsed = new URL(withProtocol);
  } catch {
    return {
      value: raw,
      errors: ["URL 格式不正确。"]
    };
  }

  if (!options.allowHttp && parsed.protocol !== "https:") {
    errors.push("URL 必须使用 https。");
  } else if (!["https:", "http:"].includes(parsed.protocol)) {
    errors.push("URL 只支持 http 或 https。");
  }

  if (parsed.username || parsed.password) {
    errors.push("URL 不能包含用户名或密码。");
  }

  if (isBlockedHostname(parsed.hostname)) {
    errors.push("URL 不能指向 localhost、内网或保留地址。");
  }

  parsed.hash = "";

  if (parsed.pathname === "/") {
    parsed.pathname = "";
  }

  return {
    value: parsed.toString().replace(/\/$/, ""),
    errors
  };
}

export function comparableUrl(value) {
  const normalized = normalizeUrl(value, {
    allowHttp: true
  });

  if (normalized.errors.length > 0) {
    return cleanText(value).toLowerCase().replace(/\/$/, "");
  }

  return normalized.value.toLowerCase().replace(/^http:\/\//, "https://").replace(/\/$/, "");
}

export function slugify(value) {
  return cleanText(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "friend-link";
}

export function validateFriendInput(input, existingFriends = [], options = {}) {
  const errors = [];
  const name = cleanText(input?.name);
  const description = cleanText(input?.description);
  const contact = cleanText(input?.contact);
  const url = normalizeUrl(input?.url, options);
  const avatar = cleanText(input?.avatar) ? normalizeUrl(input.avatar, options) : { value: "", errors: [] };
  const rss = cleanText(input?.rss) ? normalizeUrl(input.rss, options) : { value: "", errors: [] };

  if (name.length < 2) {
    errors.push("站点名称至少需要 2 个字符。");
  }

  if (name.length > MAX_NAME_LENGTH) {
    errors.push(`站点名称不能超过 ${MAX_NAME_LENGTH} 个字符。`);
  }

  if (description.length < 5) {
    errors.push("站点介绍至少需要 5 个字符。");
  }

  if (description.length > MAX_DESCRIPTION_LENGTH) {
    errors.push(`站点介绍不能超过 ${MAX_DESCRIPTION_LENGTH} 个字符。`);
  }

  errors.push(...url.errors.map((error) => `站点地址：${error}`));
  errors.push(...avatar.errors.map((error) => `头像地址：${error}`));
  errors.push(...rss.errors.map((error) => `RSS 地址：${error}`));

  const incomingUrl = comparableUrl(url.value);
  const duplicated = existingFriends.some((friend) => comparableUrl(friend.url) === incomingUrl);

  if (incomingUrl && duplicated) {
    errors.push("该站点地址已经存在于友链列表中。");
  }

  const data = {
    name,
    url: url.value,
    description,
    source: "submitted",
    createdAt: options.submittedAt || new Date().toISOString()
  };

  if (avatar.value) {
    data.avatar = avatar.value;
  }

  if (rss.value) {
    data.rss = rss.value;
  }

  if (contact) {
    data.contact = contact.slice(0, 120);
  }

  return {
    ok: errors.length === 0,
    errors,
    data
  };
}

export function sortFriendLinks(friends) {
  return [...friends].sort((a, b) => {
    return a.name.localeCompare(b.name, "zh-Hans-CN", {
      sensitivity: "base"
    });
  });
}

export function withoutPrivateFields(friend) {
  const { contact, ...publicFriend } = friend;
  return publicFriend;
}
