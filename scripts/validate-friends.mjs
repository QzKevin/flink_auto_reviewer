import { readFile } from "node:fs/promises";
import { comparableUrl, validateFriendInput } from "./lib/link.mjs";

const file = new URL("../data/friends.json", import.meta.url);
const friends = JSON.parse(await readFile(file, "utf8"));
const errors = [];
const seen = new Set();

if (!Array.isArray(friends)) {
  throw new Error("data/friends.json must be an array.");
}

for (const [index, friend] of friends.entries()) {
  const previousFriends = friends.slice(0, index);
  const validation = validateFriendInput(friend, previousFriends, {
    allowHttp: false,
    submittedAt: friend.createdAt
  });

  if (!["manual", "submitted"].includes(friend.source)) {
    validation.errors.push("source must be manual or submitted.");
  }

  if (!friend.createdAt || Number.isNaN(Date.parse(friend.createdAt))) {
    validation.errors.push("createdAt must be a valid ISO date.");
  }

  const key = comparableUrl(friend.url);

  if (seen.has(key)) {
    validation.errors.push("duplicate url.");
  }

  seen.add(key);

  if (validation.errors.length > 0) {
    errors.push({
      index,
      name: friend.name,
      errors: validation.errors
    });
  }
}

if (errors.length > 0) {
  console.error(JSON.stringify(errors, null, 2));
  process.exit(1);
}

console.log(`Validated ${friends.length} friend link(s).`);
