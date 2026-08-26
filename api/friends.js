import { readFile } from "node:fs/promises";
import { join } from "node:path";

function sendJson(res, status, payload) {
  res.status(status).setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("allow", "GET");
    return sendJson(res, 405, {
      ok: false,
      message: "Method Not Allowed"
    });
  }

  try {
    const file = await readFile(join(process.cwd(), "data", "friends.json"), "utf8");
    const friends = JSON.parse(file);

    return sendJson(res, 200, {
      ok: true,
      friends
    });
  } catch (error) {
    return sendJson(res, 500, {
      ok: false,
      message: error instanceof Error ? error.message : "Failed to read friends.json"
    });
  }
}
