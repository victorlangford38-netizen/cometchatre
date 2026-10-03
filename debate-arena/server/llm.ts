// Provider-agnostic JSON completion: OpenAI, Anthropic, Gemini, or any OpenAI-compatible endpoint.
export interface LlmConfig {
  provider: "openai" | "anthropic" | "gemini" | "openai-compatible" | "none";
  apiKey: string;
  model: string;
  baseUrl: string;
}

const DEFAULT_MODELS: Record<string, string> = {
  openai: "gpt-4.1-mini",
  anthropic: "claude-haiku-4-5",
  gemini: "gemini-2.5-flash",
  "openai-compatible": "llama-3.3-70b-versatile",
};

const DEFAULT_BASE: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai",
  anthropic: "https://api.anthropic.com/v1",
};

export function resolveLlmConfig(env: Record<string, string>): LlmConfig {
  const apiKey = env.LLM_API_KEY || env.OPENAI_API_KEY || env.ANTHROPIC_API_KEY || env.GEMINI_API_KEY || "";
  let provider = (env.LLM_PROVIDER || "").toLowerCase() as LlmConfig["provider"];
  if (!provider) {
    if (!apiKey) provider = "none";
    else if (apiKey.startsWith("sk-ant-")) provider = "anthropic";
    else if (apiKey.startsWith("AIza")) provider = "gemini";
    else if (env.LLM_BASE_URL) provider = "openai-compatible";
    else provider = "openai";
  }
  if (!apiKey) provider = "none";
  return {
    provider,
    apiKey,
    model: env.LLM_MODEL || DEFAULT_MODELS[provider] || "",
    baseUrl: (env.LLM_BASE_URL || DEFAULT_BASE[provider] || "").replace(/\/$/, ""),
  };
}

function extractJson(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error("LLM did not return JSON");
  }
}

export function createLlm(cfg: LlmConfig) {
  async function complete(system: string, user: string, temperature: number, maxTokens: number): Promise<string> {
    if (cfg.provider === "anthropic") {
      const res = await fetch(`${cfg.baseUrl}/messages`, {
        method: "POST",
        headers: {
          "x-api-key": cfg.apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: cfg.model,
          max_tokens: maxTokens,
          temperature,
          system,
          messages: [{ role: "user", content: user }],
        }),
      });
      const json: any = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? `Anthropic ${res.status}`);
      return (json.content ?? []).map((c: any) => c.text ?? "").join("");
    }

    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: cfg.model,
        temperature,
        max_tokens: maxTokens,
        ...(cfg.provider === "openai" ? { response_format: { type: "json_object" } } : {}),
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    const json: any = await res.json();
    if (!res.ok) throw new Error(json?.error?.message ?? `LLM ${res.status}`);
    return json.choices?.[0]?.message?.content ?? "";
  }

  return {
    enabled: cfg.provider !== "none",
    label: cfg.provider === "none" ? "offline (built-in fallback)" : `${cfg.provider} · ${cfg.model}`,
    async json<T>(system: string, user: string, opts: { temperature?: number; maxTokens?: number } = {}): Promise<T | null> {
      if (cfg.provider === "none") return null;
      try {
        const text = await complete(
          system + "\n\nRespond with a single JSON object only. No prose, no code fences.",
          user,
          opts.temperature ?? 0.9,
          opts.maxTokens ?? 600,
        );
        return extractJson(text) as T;
      } catch (e) {
        console.warn("[llm]", (e as Error).message);
        return null;
      }
    },
  };
}

export type Llm = ReturnType<typeof createLlm>;
