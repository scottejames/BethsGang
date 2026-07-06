# Beth's Gang

A single-page web app that helps people with ADHD get things done.  It's built as a small **plugin framework**: each tool is a self-contained module, so new ones can be added without touching the rest of
the app.

## Architecture

```
┌─────────────────────────────┐        ┌──────────────────────────────┐
│  Frontend (React + Vite)    │        │  Backend (AWS Amplify Gen2)  │
│                              │        │                              │
│  Home ── tool grid           │        │  Amplify Data (AppSync)      │
│    │                         │  GraphQL │    runAiTool(toolId, input) │
│    ▼                         │ ───────▶ │        │                    │
│  ToolShell ── active tool    │        │        ▼                    │
│    │                         │        │  Lambda: ai-assist           │
│    ▼                         │        │    SYSTEM_PROMPTS[toolId]     │
│  src/tools/<tool>/           │        │        │                    │
│    meta.ts   (id, name...)   │        │        ▼                    │
│    index.tsx (component)     │        │  Anthropic API (Claude)      │
└─────────────────────────────┘        └──────────────────────────────┘
```

- **Frontend** — a Vite + React + TypeScript single-page app. No router: `App.tsx` just
  swaps between the tool grid (`Home`) and the active tool (`ToolShell`) based on local
  state.
- **Tool framework** — every tool lives in `src/tools/<tool-id>/` and exports a
  `ToolDefinition` (`meta` + `Component`). `src/tools/registry.ts` is the single list the
  UI reads from. Adding a tool never requires touching `App.tsx`, `Home.tsx`, or routing.
- **AI backend** — tools that need Claude call a single GraphQL query,
  `runAiTool(toolId, input)`, defined in `amplify/data/resource.ts`. It's resolved by one
  Lambda (`amplify/functions/ai-assist/handler.ts`) that looks up a system prompt for the
  given `toolId` in a `SYSTEM_PROMPTS` map and calls the Claude API via the official
  `@anthropic-ai/sdk`. **Adding a new AI-backed tool only requires a new map entry here** —
  no new Lambda, no new API route. The Lambda calls `claude-haiku-4-5` — the cheapest
  current Claude model — since these tools (breakdown, tone check) don't need frontier
  reasoning. Bump to a stronger model in `handler.ts` if a future tool needs more
  capability.
- **Secrets** — the Anthropic API key is stored as an Amplify secret and injected into the
  Lambda's environment at deploy time. It is never present in frontend code or bundled
  output.

## Dependencies

| Package | Purpose |
|---|---|
| `react`, `react-dom` | UI |
| `vite`, `@vitejs/plugin-react` | Dev server & build |
| `typescript` | Type checking |
| `aws-amplify` | Frontend client for calling the Amplify Data API |
| `@aws-amplify/backend`, `@aws-amplify/backend-cli` | Amplify Gen2 backend definition (`amplify/`) and the `ampx` CLI |
| `aws-cdk-lib`, `constructs` | Required by `@aws-amplify/backend` under the hood |
| `@anthropic-ai/sdk` | Calls the Claude API from the `ai-assist` Lambda |
| `oxlint` | Linting |

Node 20+ is recommended (matches current Amplify Gen2 Lambda runtimes).

## Local development

```bash
npm install

# One-time: deploy a personal backend sandbox to your AWS account.
# This creates real AWS resources (AppSync API, Lambda, etc.) under your account
# and writes a real amplify_outputs.json (a placeholder ships in the repo so the
# frontend builds before you've deployed anything).
npx ampx sandbox

# One-time per sandbox: store your Anthropic API key as a secret.
# The sandbox command above will prompt for this if it's unset.
npx ampx sandbox secret set ANTHROPIC_API_KEY

# In a second terminal: run the frontend dev server
npm run dev
```

Leave `ampx sandbox` running while you develop — it watches `amplify/` and hot-deploys
backend changes, and keeps `amplify_outputs.json` up to date.

Other scripts:

```bash
npm run build    # tsc -b && vite build — production frontend build to dist/
npm run preview  # serve the production build locally
npm run lint     # oxlint
```

## Deploying to AWS Amplify Hosting

1. Push this repo to GitHub/GitLab/CodeCommit/Bitbucket.
2. In the AWS Amplify console, create a new app and connect the repo/branch. Amplify
   detects `amplify.yml` (checked into this repo) and uses it for both the backend
   deploy (`ampx pipeline-deploy`) and the frontend build.
3. Add the `ANTHROPIC_API_KEY` secret for that branch/environment: either via
   `npx ampx pipeline-deploy` secret configuration or in the Amplify console under
   **App settings → Secrets**. The `ai-assist` Lambda reads it from its environment —
   see `amplify/functions/ai-assist/resource.ts`.
4. Push to the connected branch to trigger a build. Amplify builds the backend first,
   then the frontend (which picks up the freshly generated `amplify_outputs.json`).

## Adding a new tool

1. Create `src/tools/<tool-id>/meta.ts` exporting a `ToolMeta` (id, name, tagline, icon).
2. Create `src/tools/<tool-id>/index.tsx` exporting a `ToolDefinition` (`meta` + a React
   component). Use `useAiTool(meta.id)` from `src/hooks/useAiTool.ts` if the tool calls
   Claude.
3. Add the tool to the list in `src/tools/registry.ts`.
4. If the tool needs Claude: add a `SYSTEM_PROMPTS[<tool-id>]` entry in
   `amplify/functions/ai-assist/handler.ts` describing what the model should do.
5. If the tool needs no AI at all, it can skip step 4 entirely and just do its own thing
   client-side.

No routing, no new Lambda, no new API endpoint required in the common case.
