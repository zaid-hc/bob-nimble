# Bob Board — Beta

![Bob Board — mission control](public/bob-board-hero.png)


> **v0.1.0-beta** · Internal tool for HashiCorp Vault & Boundary support engineers  
> Works alongside [MCP-Servers](https://github.ibm.com/HashiCorp-Support/MCP-Servers) — install that first.

A local web dashboard that wraps IBM Bob with persistent conversations, workspaces, streaming responses, attachment support, MCP server selection, and quick-access links to Salesforce, Confluence, and the IBM Support KB.

---

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| macOS | any | `start-v3.mjs` uses macOS-only tools (`lsof`); Linux/Windows not tested |
| Node.js | 20 or 22 | `node --version` |
| IBM Bob CLI | latest | must be on `$PATH` — `bob --version`. This is IBM Bob, not the HashiCorp Vault CLI |
| OpenCode | v2+ | installed automatically with IBM Bob — `opencode --version` |
| OpenCode Bob plugin | latest | `@hashicorp/opencode-bob-gateway-plugin` — must be registered in `~/.config/opencode/opencode.json` |
| IBMid OpenCode session | active | run `opencode auth list` — must show `ibm-bob`. See [Authentication](#authentication) below |
| MCP-Servers | built | follow [SETUP.md in MCP-Servers](https://github.ibm.com/HashiCorp-Support/MCP-Servers/blob/main/SETUP.md) first |
| GitHub PAT | `repo` scope | needed by MCP-Servers — set in `mcp.json`, not here |

---

## Install

```bash
git clone https://github.ibm.com/HashiCorp-Support/bob-web-v3.git ~/dashboard
cd ~/dashboard
npm install
```

No separate token or API key is required. The dashboard uses the Bob CLI already on your machine.

---

## Authentication

The dashboard routes all chat through OpenCode, which must have an active IBMid session for `ibm-bob`. Check first:

```bash
opencode auth list
```

If `ibm-bob` already appears in the list, you are good — skip to [Run](#run).

If it is missing, install the Bob Gateway plugin and authenticate:

```bash
# 1. Authenticate npm to GitHub Packages
gh auth refresh --scopes read:packages
npm config set //npm.pkg.github.com/:_authToken $(gh auth token)
npm config set @hashicorp:registry https://npm.pkg.github.com/

# 2. Install the plugin globally
opencode plugin -g "@hashicorp/opencode-bob-gateway-plugin"

# 3. Sign in with IBMid
opencode auth login ibm-bob --method ibmid

# 4. Verify
opencode auth list
# → should show: ibm-bob  oauth
```

Follow the browser prompt for the IBMid OAuth flow. You only need to do this once — OpenCode stores the session across restarts.

---

## Run

```bash
node start-v3.mjs
# or
./start.sh
```

Opens at **http://localhost:3002**. Keep the terminal running — closing it stops the dashboard.

---

## First-time checklist

1. **Install MCP-Servers first** — follow [SETUP.md](https://github.ibm.com/HashiCorp-Support/MCP-Servers/blob/main/SETUP.md). The dashboard reads `~/.bob/settings/mcp.json` at startup; any server registered there appears in the MCP picker automatically.

2. **Confirm OpenCode is authenticated** — run `opencode auth list` and check that `ibm-bob` appears. If it does not, follow the [Authentication](#authentication) steps above before proceeding. Without an active session the model list will be empty and all chat requests will fail.

3. **Connect IBMid (optional)** — open **More → Connect IBMid** and sign in. This enables direct Bob Gateway model discovery on that screen. Current chat still runs through OpenCode regardless of whether you connect IBMid.

4. **Pick a workspace** — use the sidebar to create or register a project folder. Files written by Agent mode land there.

5. **Choose a mode** — Ask, Agent, Plan, or Code. Enable relevant MCP servers from the toolbar before sending.

---

## How MCP servers appear

The dashboard reads `~/.bob/settings/mcp.json` at startup using the same file that Bob Shell uses. There is nothing to configure separately here.

**Keyword suggestions** — as you type, the dashboard surfaces relevant servers:

| You type | Suggested server |
|----------|-----------------|
| "vault" | Vault Docs |
| "vault enterprise" / "HCP Vault" | Vault Enterprise Docs |
| "boundary" | Boundary Docs |
| "terraform" / "provider" | Terraform Docs |
| "kubernetes" / "k8s" / "helm" | Kubernetes Docs |
| "aws" / "eks" | AWS Docs |
| "azure" / "aks" / "entra" | Azure Docs |
| "openshift" | OpenShift Docs |
| "pki" / "tls" / "certificate" | PKI / TLS Docs |
| "ldap" / "active directory" | LDAP / AD Docs |
| "prometheus" / "grafana" | Observability Docs |
| "jira" / "confluence" | Jira & Confluence |
| … | … |

Click the suggestion chip to enable it. Click **×** to dismiss without enabling.

---

## Bob Gateway connection

See [DIRECT-GATEWAY.md](./DIRECT-GATEWAY.md) for full details on what the Gateway connection does, which models are available, and how to request access to additional models like Claude Sonnet.

---

## What is stored locally

| Location | Contents |
|----------|----------|
| `backend/data/sessions.db` | Conversation history and workspace registrations |
| `~/.bob/settings/mcp.json` | MCP server registrations (shared with Bob Shell) |
| Backend memory only | IBMid tokens — cleared on restart |

No credentials are written to disk by the dashboard. MCP-Servers tokens live in `mcp.json` and are managed by MCP-Servers setup.

---

## Distribute to a colleague

The dashboard is self-contained. A colleague needs:

1. Bob CLI + OpenCode already working on their machine.
2. MCP-Servers built and registered per [SETUP.md](https://github.ibm.com/HashiCorp-Support/MCP-Servers/blob/main/SETUP.md).
3. Clone this repo, `npm install`, `node start-v3.mjs`.

Each person runs their own local instance with their own IBMid session and their own conversation database.

---

## Development

```bash
# Run backend and frontend concurrently with live reload
npm run dev:all

# TypeScript check + Vite production build
npm run build

# Lint
npm run lint

# Backend tests
cd backend && node --test
```

---

## Status

| Feature | Status |
|---------|--------|
| Chat via OpenCode | ✅ Working |
| MCP server selection | ✅ Working |
| Workspaces + file viewer | ✅ Working |
| Streaming + cancellation | ✅ Working |
| Attachments (text, code, logs) | ✅ Working |
| Persistent conversations | ✅ Working |
| IBMid sign-in | ✅ Working (memory only) |
| Bob Gateway model discovery | ✅ Working (on connection screen) |
| Direct Gateway chat | 🔧 Implemented, not default |
| Interactive tool approvals | 🔧 Not yet connected |

---

## Status notes

### Direct Gateway chat — implemented, not default

Normal chat goes: **your message → Bob Board backend → OpenCode CLI → Bob Gateway → model → response**.

OpenCode is the middle layer that handles the full agent loop — it picks tools, executes MCP calls, manages multi-step reasoning, enforces permissions, and streams the result back.

The direct Gateway path bypasses OpenCode entirely: **your message → Bob Board backend → Bob Gateway HTTP API → model → response**. This path is fully implemented (`backend/beta-runtime.cjs`) and wired into the `/api/chat` route — it authenticates with your IBMid token, streams responses, handles cancellation and timeouts, persists the conversation, and reports token usage.

**Why it is not the default:** without OpenCode in the middle, there is no agent loop — no MCP tools, no skills, no multi-step reasoning. The whole point of Bob Board is that Bob can search GitHub issues, read Vault docs, fetch Confluence pages, and call tools. None of that works on the direct path yet. Switching it on as default before the tool loop is ready would silently give every user a degraded plain-chatbot experience.

The plan: wire up tool execution over the Gateway API, validate it end-to-end, then make it the default and remove the OpenCode requirement.

### Interactive tool approvals — not yet connected

When Bob runs in Agent mode, some actions require your explicit approval before they execute — writing a file, running a shell command, pushing to git. OpenCode handles this today by pausing and waiting for confirmation in the terminal.

Bob Board has no UI for this yet. The backend currently passes preapproved tool permissions to OpenCode for MCP reads and file reads, and blocks everything else. There is no mid-stream approval popup in the chat.

What needs building:
- The backend intercepts OpenCode's approval prompts mid-stream and emits a structured SSE event
- The frontend renders an inline approval card in the chat with **Accept / Deny** buttons
- The user's response unblocks the OpenCode process and streaming continues

Until that is built, Agent mode works for read-only operations and preapproved tools. Write actions (file creation, git operations) are handled through the workspace authoring policy — Bob asks in the chat text before writing, rather than through a real-time button.
