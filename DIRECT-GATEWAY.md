# Bob Gateway — Integration Reference

> This document covers what the Bob Gateway connection in the dashboard does, how it works, what models are available, and how to request access to additional models (including Claude Sonnet / Claude 3.5).

---

## What "Connect IBMid" does

**More → Connect IBMid** opens an independent IBMid authentication flow that is separate from your normal Bob Shell / OpenCode credentials. It does not read or modify OpenCode's credential store.

The flow:

1. The backend opens an ephemeral loopback HTTP server on a random port (e.g. `http://127.0.0.1:PORT/bob-shell-auth-callback`).
2. Your browser is directed to `https://api.us-east.bob.ibm.com/authn/v1/auth/login` with that callback as the `redirect_uri`.
3. You complete IBMid authentication in the browser tab.
4. Bob redirects to the loopback callback with a one-time `code` and the original `state` value.
5. The backend validates the `state` (constant-time comparison, single-use, 3-minute deadline) then exchanges the code at `/authn/v1/auth/token`.
6. The resulting access token is used to call `/admin/v1/profile` and return your available instances and teams.
7. You select one instance + team explicitly. The dashboard never silently picks a tenant.
8. **Tokens are stored in backend memory only.** Restarting the backend clears the session. Credentials are never written to disk or logged.

Token refresh runs at `/authn/v1/auth/refresh` before any request once the access token is within 60 seconds of expiry. Concurrent refreshes are serialized.

---

## What endpoints are used

| Purpose | Endpoint |
|---------|----------|
| Login redirect | `GET /authn/v1/auth/login` |
| Code exchange | `POST /authn/v1/auth/token` |
| Token refresh | `POST /authn/v1/auth/refresh` |
| Profile / instance list | `GET /admin/v1/profile` |
| Model catalog | `GET /inference/v1/model/info` |
| Chat completions | `POST /inference/v1/chat/completions` |

All requests go to `https://api.us-east.bob.ibm.com` (or your selected instance's regional domain). The `User-Agent` header is `ibm-bob-gateway-plugin` — this is required; the Cloudflare WAF layer in front of the Gateway will challenge unknown User-Agent strings.

Every request includes your instance ID and team ID as `x-instance-id` and `x-team-id` headers. The backend never guesses a tenant.

---

## Why this exists separately from normal chat

Normal chat still runs through OpenCode + the Bob Gateway plugin. The direct Gateway connection in the dashboard was implemented to:

- Show live model discovery scoped to your IBM instance/team
- Provide a fallback plain-chat path that does not require a local OpenCode installation
- Serve as the foundation for a future full direct mode (tool loop, approvals, skills)

The two paths currently return the same 12-model catalog from the same endpoint with the same credentials.

---

## Available models

After signing in and selecting your instance/team, the **Connect IBMid** screen shows the live catalog for your tenant. The catalog is what Bob Gateway's `/inference/v1/model/info` returns for your specific instance and team.

A typical catalog (your exact list depends on your tenant's entitlements):

| Model ID | Provider | Notes |
|----------|----------|-------|
| `ibm-bob/granite-3-3-8b-instruct` | IBM Granite | Fast, good for structured tasks |
| `ibm-bob/granite-3-2-8b-instruct` | IBM Granite | |
| `ibm-bob/granite-3-1-8b-instruct` | IBM Granite | |
| `ibm-bob/granite-3-dense-2b-instruct` | IBM Granite | Smallest / fastest |
| `ibm-bob/llama-3-3-70b-instruct` | Meta Llama | Strong general reasoning |
| `ibm-bob/llama-3-1-70b-instruct` | Meta Llama | |
| `ibm-bob/llama-3-2-90b-vision-instruct` | Meta Llama | Vision capable |
| `ibm-bob/mistral-large-2411` | Mistral | Strong multilingual + code |
| `ibm-bob/mixtral-8x7b-instruct-v01` | Mistral | |
| `ibm-bob/claude-3-5-sonnet-20241022` | Anthropic | **Requires approval — see below** |
| `ibm-bob/claude-3-opus-20240229` | Anthropic | **Requires approval — see below** |
| `ibm-bob/claude-3-haiku-20240307` | Anthropic | **Requires approval — see below** |

> A model appearing in the catalog only means it is provisioned for your tenant. Inference access requires the model to also be **enabled for your team**. Models marked "Requires approval" may appear in the catalog but return a `403 catalog-access` error when called until explicitly enabled.

---

## Requesting access to Claude Sonnet / Anthropic models

Anthropic models (Sonnet, Opus, Haiku) are provisioned separately from the base catalog because they carry additional data-handling commitments. Access is controlled by the **Bob platform team** inside IBM.

### What you need

- Your **IBM Bob instance ID** — shown on the Connect IBMid screen after sign-in.
- Your **team ID** — shown alongside the instance ID.
- The **model name(s)** you want enabled (e.g. `claude-3-5-sonnet-20241022`).

### How to request

1. Open the IBM internal Bob support channel: **#ask-bob** on Slack (search the IBM Slack workspace).
2. Include: your instance ID, team ID, model name(s), and business justification (e.g. "HashiCorp Support team uses Sonnet for nuanced multi-step incident analysis").
3. The Bob platform team will enable the model(s) for your team and confirm.

There is no self-service toggle. Once enabled, the model will return valid completions on the next call — no dashboard restart is needed.

### Alternative: request through your IBM account manager

If the Slack channel does not apply to your situation, your IBM account representative or the person who set up your Bob instance can escalate the request through the Bob platform provisioning process.

---

## Understanding Gateway error codes

The dashboard classifies Gateway errors before displaying them. Tokens and raw upstream bodies are never shown.

| Code | Meaning | What to do |
|------|---------|-----------|
| `edge-challenge` | Cloudflare WAF blocked the request (wrong User-Agent or IP policy) | Unlikely now; the dashboard sends the correct UA. Report with the `cf-ray` reference. |
| `scope` | Access token is missing a required OAuth scope | Re-sign in. If it recurs, the Bob platform team may need to update scope grants for your client. |
| `catalog-access` | Model exists in catalog but your team is not enabled for it | Request model access (see above). |
| `profile-access` | Instance or team ID rejected | Confirm instance/team selection. |
| `token` | Token expired or invalid | Re-sign in via More → Connect IBMid. |
| `gateway-json` | Gateway returned a JSON error (details withheld for security) | Check sign-in status; retry. |
| `html-response` | Gateway returned HTML (likely a maintenance or error page) | Retry in a few minutes. |

---

## Current implementation status

| Capability | Status |
|------------|--------|
| IBMid sign-in and token refresh | ✅ Complete |
| Regional instance/team selection | ✅ Complete |
| Live model catalog display | ✅ Complete (connection screen only) |
| Direct chat completions (streaming) | ✅ Implemented, not default |
| MCP tool loop over Gateway | 🔧 Not yet connected |
| Secure credential persistence (Keychain / Credential Manager) | 🔧 Not yet implemented |
| Automatic retry on refresh expiry | 🔧 Planned |

The normal chat path still runs through OpenCode. The direct Gateway path is available as a backend branch but is not the default. Switching it to default requires validating the tool loop, attachment handling, and skill injection end-to-end.

---

## Security boundaries

- Tokens are in backend process memory only. Restarting the backend on port 3100 clears them.
- No tokens are written to disk, logged, or returned to the browser.
- The loopback callback server binds to `127.0.0.1` only — it is not reachable from the network.
- State tokens are single-use and have a 3-minute deadline.
- The client validates the regional hostname against `api.*.bob.ibm.com` and refuses non-HTTPS origins.
- Redirects are rejected on all Gateway requests (`redirect: 'error'`).
- All Gateway requests include explicit instance/team headers — tenant is never inferred.
