Debate Arena
============

Real-time 1v1 debate game with an LLM judge, running on CometChat.

Two players argue a random motion over three timed rounds. After every message the judge
re-scores both sides and posts its rulings into the chat. Spectators join from any device,
spam hype reactions and vote for a winner.

Features
--------

* Lobby with PRO / CON podiums; extra players join as the crowd
* Motion slot reel and face-off intro
* Rounds: Opening, Clash, Closing
* Live scoring on four axes: evidence, logic, clarity, rebuttal
* Judge calls: RECEIPTS, FALLACY, DODGE, BURN, STRONG POINT (with unanswered-question tracking)
* Crowd momentum bar, hype reactions and crowd vote
* Verdict screen: scorecard race, winner, reasoning, key moment, crowd vs judge
* Rematch with swapped sides
* Responsive phone layout for spectators

Getting started
---------------

Prerequisites: Node 20+, a CometChat app, optionally an LLM API key.

    npm ci
    cp .env.example .env
    npm run dev

The app is served on port 5175. Use the Network URL printed by Vite to join from phones.

Environment variables are documented in `.env.example`. App ID / region / auth key can
also come from `.cometchat/config.json` (`npx @cometchat/skills-cli provision run`).
With no LLM key the judge uses a heuristic offline scorer.

Architecture
------------

    src/       React 19 client (CometChat React UI Kit v7)
    server/    game server as a Vite plugin: state machine, SSE stream, judge, CometChat REST
    shared/    types shared by client and server

* Game state is authoritative on the server and pushed over SSE (`/api/stream`).
* Player actions are plain `POST /api/<action>` calls.
* The judge is a CometChat user; it posts via `POST /v3/messages` with `onBehalfOf`.
* Each game creates its own CometChat group with the judge as owner.

Scripts
-------

    npm run dev         start the dev server + game server
    npm run build       typecheck and build
    npm run preview     preview the production build
    npm run check       typecheck only

Tooling: CometChat MCP connector, configured in `.cursor/mcp.json`.
