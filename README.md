# Bob Board — Beta

> **v0.1.0-beta** · Internal tool for HashiCorp Vault & Boundary support engineers  
> Works alongside [MCP-Servers](https://github.ibm.com/HashiCorp-Support/MCP-Servers) — install that first.

A local web dashboard that wraps IBM Bob with persistent conversations, workspaces, streaming responses, attachment support, MCP server selection, and quick-access links to Salesforce, Confluence, and the IBM Support KB.

---

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | 20 or 22 | `node --version` |
| Bob CLI | latest | must be on `$PATH` — `bob --version` |
| OpenCode | any | required by Bob for inference — installed as part of Bob |
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

2. **Connect IBMid (optional)** — open **More → Connect IBMid** and sign in. This enables direct Bob Gateway model discovery on that screen. Current chat still runs through OpenCode regardless of whether you connect IBMid.

3. **Pick a workspace** — use the sidebar to create or register a project folder. Files written by Agent mode land there.

4. **Choose a mode** — Ask, Agent, Plan, or Code. Enable relevant MCP servers from the toolbar before sending.

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
