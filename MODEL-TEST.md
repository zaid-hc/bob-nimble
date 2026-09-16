# V3 Bob Gateway model test

Open http://127.0.0.1:3002 and choose **Model test** from the V3 view selector in the header. Other views are Chat, Bob Shell, and IDE history.

This is a bounded compatibility experiment, not the completed OpenCode backend migration. V2 and its backend code/database are unchanged. Existing V3 Bob Shell and read-only IDE views are retained. V3 received the current V2 frontend and chat reliability changes on September 12, 2026. Normal Chat still uses the existing shared Bob backend; model-test sessions remain separate.

## Scope

- Uses the installed OpenCode executable and IBM Bob gateway plugin/authentication.
- Lists only `ibm-bob` models. A cached model listing is not proof of availability.
- Runs the selected model through `opencode run --format json` with prompts on stdin, without a shell.
- Continues session context for follow-up prompts. Switching models or New test starts a new session.
- OpenCode stores these test sessions locally, independently of the dashboard database. Reloading the panel clears its in-memory session selection and transcript; this prototype does not browse prior test sessions.
- Tool permission wildcard is denied, sharing disabled, and the working directory is a fresh temporary directory. This is not an operating-system sandbox. Installed OpenCode plugins and configuration still load; use only non-sensitive prompts.
- The installed plugin has no explicit feedback-off switch. This experiment sets the feedback threshold to negative Number.MAX_VALUE, suppressing budget feedback under the reviewed finite balance comparison. It does not modify global environment or plugin settings. Recheck this behavior after plugin upgrades.
- There is no dashboard MCP/skill/attachment bridge yet. Model tests cannot validate those features.
- Stop, disconnect, output cap (1 MB), and a 2-minute deadline terminate the test process. Unix process groups are terminated; Windows behavior is not yet validated.
- Tokens are shown only when reported. The OpenCode cost field is not treated as verified Bobcoin usage.

## Local endpoint boundary

Development-only Vite middleware at `/model-lab`. Bound to loopback and port 3002 with strict port matching. Checks Host, peer address, Origin/fetch metadata, and a fresh per-server bearer token. No token or raw gateway error is displayed. Endpoint accepts only discovered Bob models and session IDs created during this server lifetime. It does not expose a configurable command, path, or arbitrary provider.

Production static preview does not implement these endpoints. Start V3 with its existing dev script. `OPENCODE_BIN` can override the executable location for supported local installations.

## Next integration gates

Connect selected MCPs/skills, permission requests, attachments, model metadata, and persisted dashboard history to a proper OpenCode server adapter. Validate each separately before moving anything into V2.
