import { request, retryDelay, sleep } from "./http.ts";
import type { Fetch, Sleep } from "./http.ts";

export type Notify = (content: string) => Promise<void>;

export interface Config {
  webhookUrl: string;
  includeAll: boolean;
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const raw = env.DISCORD_WEBHOOK_URL?.trim();
  if (!raw) throw new Error("Set DISCORD_WEBHOOK_URL");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("DISCORD_WEBHOOK_URL must be an HTTPS Discord webhook URL");
  }
  if (url.protocol !== "https:" ||
    !["discord.com", "discordapp.com"].includes(url.hostname) ||
    !/^\/api\/webhooks\/\d+\/[^/]+$/u.test(url.pathname) ||
    url.username || url.password || url.port) {
    throw new Error("DISCORD_WEBHOOK_URL must be an HTTPS Discord webhook URL");
  }
  return { webhookUrl: raw, includeAll: /^(1|true|yes)$/iu.test(env.LUNCH_INCLUDE_ALL?.trim() ?? "") };
}

export function createNotifier(
  webhookUrl: string,
  fetcher: Fetch = globalThis.fetch,
  pause: Sleep = sleep,
): Notify {
  const url = new URL(webhookUrl);
  url.searchParams.set("wait", "true");
  return async (content) => {
    if (!content || content.length > 2000) {
      throw new Error("Discord message must contain between 1 and 2000 characters");
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await request(url.href, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, allowed_mentions: { parse: [] }, flags: 4 }),
      }, "Discord", { fetch: fetcher, retry: false, acceptedStatuses: [429] });
      if (response.status !== 429) return;
      if (attempt === 2) throw new Error("Discord rate limit persisted after three attempts");
      await pause(retryDelay(response.headers.get("retry-after"), attempt));
    }
  };
}
