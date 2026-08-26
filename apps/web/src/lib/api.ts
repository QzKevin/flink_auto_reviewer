export type FriendLink = {
  name: string;
  url: string;
  avatar?: string;
  description: string;
  rss?: string;
  source: "manual" | "submitted";
  createdAt: string;
};

export type SubmitPayload = {
  name: string;
  url: string;
  avatar?: string;
  description: string;
  rss?: string;
  contact?: string;
};

export type SubmitResponse = {
  ok: boolean;
  message: string;
  submissionId?: string;
  dryRun?: boolean;
  errors?: string[];
};

async function readJson<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return (await response.json()) as T;
  }

  return {
    ok: false,
    message: await response.text()
  } as T;
}

export async function fetchFriendLinks(): Promise<FriendLink[]> {
  const response = await fetch("/api/friends", {
    headers: {
      accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error("无法读取友链列表");
  }

  const payload = await readJson<{ friends: FriendLink[] }>(response);
  return payload.friends;
}

export async function submitFriendLink(payload: SubmitPayload): Promise<SubmitResponse> {
  const response = await fetch("/api/submit-link", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json"
    },
    body: JSON.stringify(payload)
  });

  const result = await readJson<SubmitResponse>(response);

  if (!response.ok) {
    return {
      ok: false,
      message: result.message || "提交失败，请稍后再试。",
      errors: result.errors
    };
  }

  return result;
}
