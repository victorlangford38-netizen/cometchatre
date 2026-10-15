# Debate Arena

Two debaters, three timed rounds, and an AI judge. Real chat, attachments, voice notes and optional camera/voice calls run on CometChat. The existing blue/red arena theme is preserved.

## Play

1. Enter a name to create an arena. Copy the invitation link and share it with a rival and spectators.
2. Each person opens the link and enters their own name. The first two take PRO and CON; others join the crowd. Up to 10 people can join before the debate starts.
3. The host spins the motion. Debate in text through Opening, Clash and Closing. Open **Live stage** to join with camera, voice or both off.
4. The judge scores text arguments, flags fallacies and unanswered questions, and delivers a verdict. The host can rematch with swapped sides or return to the lobby.

Only text is scored. Voice calls and voice notes are not transcribed or scored. Spectators join the stage with microphone/camera off in the UI. Calls are not recorded automatically. Browser camera/microphone access requires HTTPS (localhost also works).

## Local setup

Use Node.js 22 or later. Copy `.env.example` to `.env` and add your server credentials.

```sh
npm ci
npm run dev
```

Open http://localhost:5175. Use separate browser tabs for different guests. Guest login is scoped to a tab and survives reloads; closing the tab can lose the guest session. No account/password is required.

Without Redis, local development saves rooms under ignored `.data/rooms/`. Run one local dev server for this directory. Vercel deliberately refuses to run without Redis; it never falls back to temporary server memory/files.

## Deploy on Vercel from GitHub

Import this repository as a Vite project. If this folder is inside a larger repository, set the Root Directory to `debate-arena`. Build: `npm run build`; output: `dist`; Node: 22. `vercel.json` includes the serverless API and 60-second execution limit.

Configure these **server environment variables** for Production (and separately for Preview if wanted):

| Variable | Required | Purpose |
| --- | --- | --- |
| `COMETCHAT_APP_ID` | yes | CometChat application ID |
| `COMETCHAT_REGION` | yes | Application region (`us`, `eu`, or `in`) |
| `COMETCHAT_REST_API_KEY` | yes | Full-access server REST key for guest users, tokens, private groups and message verification |
| `UPSTASH_REDIS_REST_URL` | yes | Durable Redis REST endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | yes | Redis read/write token |
| `LLM_API_KEY` | for AI judge | Provider key; absent uses the built-in heuristic judge |
| `LLM_PROVIDER` | optional | `openai`, `anthropic`, `gemini`, `openai-compatible` |
| `LLM_MODEL` | optional | Model identifier |
| `LLM_BASE_URL` | optional | Compatible provider endpoint |
| `GAME_PACE` | optional | `normal` (default) or short `demo` rounds |

Vercel Marketplace Upstash integration can supply Redis credentials; `KV_REST_API_URL` / `KV_REST_API_TOKEN` are also accepted. Use a permanent database owned by the project, not a temporary trial database. Configure any CometChat application domain restrictions to include the actual deployed hostname and ensure Chat and Calls are enabled in that app. Redeploy after changing environment variables.

Never put REST, LLM or Redis keys in a `VITE_` variable or commit `.env`, `.data`, `.cometchat` or `.vercel`. The browser receives only app ID, region, public configuration and its own guest token. It never receives a shared CometChat Auth Key.

## Server behavior

- Cryptographically random invitation IDs isolate rooms. Possession of an invitation allows joining; this is a guest invitation system, not verified accounts.
- Private CometChat groups are provisioned per match. Unique user identities are scoped to a guest session and room. A submitted UID cannot impersonate another player.
- Server-side host checks protect start, reset, topic pin and rematch. Occupied podiums cannot be stolen. If the host is absent for 90 seconds, the next active member becomes host.
- Redis serializes room changes using expiring locks and fenced atomic commits. Requests rehydrate state, so serverless cold starts do not reset matches. Deadlines advance on member requests; there is no background timer or persistent socket requirement.
- Game state polls every 1.2 seconds; CometChat delivers messages/calls directly. A busy judge can temporarily delay state refreshes. Reconnects and transient conflicts retry.
- The scoring endpoint fetches the message from CometChat, verifies sender/group/timestamp, and deduplicates its ID. Client-supplied argument text is ignored. LLM requests are bounded and have a heuristic fallback.
- Rooms expire 24 hours after creation. This expires the arena session; it does **not** delete CometChat message history or provider accounts/tokens. Configure provider retention and cleanup for long-running use. Creation/join and action rate limits reduce accidental abuse; provider quota/billing limits still apply.
- Text scoring is capped at 160 messages per match; only the first 400 characters of each argument enter the live scoring transcript. The final judge uses the last 40 transcript entries. This is an entertainment game, not a factual adjudication service.

## Verification

```sh
npm test
npm run build
npm audit
```

Tests cover guest identity, host authorization, cross-room isolation, concurrent joins/capacity, forged and duplicate messages, deadline recovery, final verdict/rematch, expiry, host recovery and refusing ephemeral storage on Vercel. CI runs tests/build on push and pull requests.

Before calling a deployment ready, open the actual HTTPS URL with two independent guest sessions and check: invite, join, text delivery/scoring, camera/voice connection, reload, verdict and rematch. A successful local build does not verify production Redis, Vercel routing, domain settings or real remote audio.

References: [CometChat token login](https://www.cometchat.com/docs/ui-kit/react/next-js-integration), [Upstash REST API](https://upstash.com/docs/redis/features/restapi), [Vercel Functions](https://vercel.com/docs/functions).
