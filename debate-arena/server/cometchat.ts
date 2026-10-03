// Thin CometChat REST client (server-side only — uses the fullAccess REST API key).
export interface CometChatConfig {
  appId: string;
  region: string;
  authKey: string;
  restKey: string;
}

class RestError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

export type CometChatRest = ReturnType<typeof createCometChatRest>;

export function createCometChatRest(cfg: CometChatConfig) {
  const base = `https://${cfg.appId}.api-${cfg.region}.cometchat.io/v3`;

  async function req<T = any>(method: string, path: string, body?: unknown, onBehalfOf?: string): Promise<T> {
    const res = await fetch(base + path, {
      method,
      headers: {
        apikey: cfg.restKey,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(onBehalfOf ? { onBehalfOf } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new RestError(json?.error?.message ?? res.statusText, res.status, json?.error?.code);
    }
    return json.data as T;
  }

  return {
    async upsertUser(uid: string, name: string, avatar?: string, metadata?: Record<string, unknown>) {
      try {
        return await req("PUT", `/users/${uid}`, { name, avatar, metadata });
      } catch (e) {
        if (e instanceof RestError && (e.status === 404 || e.code === "ERR_UID_NOT_FOUND")) {
          return req("POST", "/users", { uid, name, avatar, metadata });
        }
        throw e;
      }
    },

    createGroup(guid: string, name: string, participants: string[], opts: { icon?: string; owner?: string; admins?: string[] } = {}) {
      return req("POST", "/groups", {
        guid,
        name,
        type: "public",
        icon: opts.icon,
        owner: opts.owner,
        members: { participants, admins: opts.admins ?? [] },
      });
    },

    deleteGroup(guid: string) {
      return req("DELETE", `/groups/${guid}`).catch(() => undefined);
    },

    sendText(from: string, receiver: string, receiverType: "user" | "group", text: string, metadata?: Record<string, unknown>) {
      return req<{ id: string }>(
        "POST",
        "/messages",
        { receiver, receiverType, category: "message", type: "text", data: { text, metadata } },
        from,
      );
    },
  };
}
