import { appendFile, readFile, writeFile } from "node:fs/promises";
import { comparableUrl, slugify, sortFriendLinks, validateFriendInput, withoutPrivateFields } from "./lib/link.mjs";

async function writeOutput(name, value) {
  if (!process.env.GITHUB_OUTPUT) {
    return;
  }

  const delimiter = `EOF_${name}_${Date.now()}`;
  await appendFile(process.env.GITHUB_OUTPUT, `${name}<<${delimiter}\n${value}\n${delimiter}\n`);
}

async function main() {
  const payload = JSON.parse(process.env.PAYLOAD_JSON || "{}");
  const submittedAt = process.env.SUBMITTED_AT || new Date().toISOString();
  const submissionId = process.env.SUBMISSION_ID || `local-${Date.now()}`;
  const siteBaseUrl = process.env.SITE_BASE_URL || "";
  const friendsFile = new URL("../data/friends.json", import.meta.url);
  const friends = JSON.parse(await readFile(friendsFile, "utf8"));
  const validation = validateFriendInput(payload, friends, {
    allowHttp: false,
    submittedAt
  });

  if (!validation.ok) {
    throw new Error(`Friend link validation failed:\n${validation.errors.join("\n")}`);
  }

  const publicFriend = withoutPrivateFields(validation.data);
  const duplicate = friends.some((friend) => comparableUrl(friend.url) === comparableUrl(publicFriend.url));

  if (!duplicate) {
    const nextFriends = sortFriendLinks([...friends, publicFriend]);
    await writeFile(friendsFile, `${JSON.stringify(nextFriends, null, 2)}\n`);
  }

  const branch = `friend-link/${submissionId}`;
  const title = `Add friend link: ${publicFriend.name}`;
  const body = [
    "## Friend link submission",
    "",
    `- Submission ID: ${submissionId}`,
    `- Submitted at: ${submittedAt}`,
    `- Site name: ${publicFriend.name}`,
    `- Site URL: ${publicFriend.url}`,
    payload.contact ? `- Contact: ${payload.contact}` : "- Contact: not provided",
    siteBaseUrl ? `- Expected backlink target: ${siteBaseUrl}` : "- Expected backlink target: not configured",
    "",
    "This PR is intentionally left open for manual review for 12 hours.",
    "If it is still pending after that window, the scheduled workflow will run the automatic review."
  ].join("\n");

  await writeOutput("branch_name", branch);
  await writeOutput("branch_slug", slugify(publicFriend.name));
  await writeOutput("pr_title", title);
  await writeOutput("pr_body", body);
  await writeOutput("no_change", duplicate ? "true" : "false");

  console.log(duplicate ? "Friend link already exists; no change written." : `Prepared ${publicFriend.name}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
