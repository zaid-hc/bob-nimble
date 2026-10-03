# bob-nimble

A standalone fork of [bob-board](https://github.ibm.com/HashiCorp-Support/bob-board) with **Nimble pre-flight triage** built in.

Before each message reaches IBM Bob, a local [Nimble](https://ollama.com/library/nimble) model (9B, runs in ~100 ms) classifies the query and auto-selects the best skill and MCP servers. This cuts unnecessary context sent to Bob and improves first-response accuracy.

## How it differs from bob-board

| | bob-board | bob-nimble |
|---|---|---|
| Pre-flight triage | ❌ | ✅ Nimble (local, ~100 ms) |
| Skill auto-select | Manual | ✅ Automatic |
| MCP auto-select | Manual | ✅ Automatic |
| Triage badge in UI | ❌ | ✅ `⚡ Nimble: skill=X mcps=[Y]` |
| Ports | 3002 / 3100 | 3003 / 3101 |
| Workspace | `~/.bob/playground` | `~/.bob/nimble-playground` |
| Session DB | `backend/data/sessions.db` | `backend/data/nimble-sessions.db` |

## Prerequisites

- [IBM Bob](https://ibm.biz/ibm-bob) installed (`/opt/homebrew/bin/bob`)
- [Ollama](https://ollama.com) ≥ 0.35.1 running locally
- Nimble model pulled: `ollama pull nimble`

## Quick start

```bash
git clone https://github.com/zaid-hc/bob-nimble.git
cd bob-nimble

# Install root dependencies (Vite / React)
npm install

# Install backend dependencies
cd backend && npm install && cd ..

# Start (ports 3003 frontend, 3101 backend)
node start-nimble.mjs
```

Open **http://localhost:3003** — you'll see a `⚡ Nimble:` badge above each message showing what skill and MCPs were selected.

## Architecture

```
browser → Vite :3003 → /api proxy → Express :3101 → bob CLI
                                         └─ POST /api/triage → Ollama nimble
```

The triage call happens client-side (in `Composer.tsx`) before the message is submitted. If Nimble is unavailable the UI falls back silently with no degradation.

## Triage API

```
GET  /api/triage/status   → { available, ollamaRunning, models }
POST /api/triage          → { skill, mcps, urgency, confidence, durationMs }
     body: { "message": "vault seal error after reboot" }
```
