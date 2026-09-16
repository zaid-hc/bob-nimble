# V3 normal-chat OpenCode integration

## Use

Open V3 on http://127.0.0.1:3002. In normal Chat, choose **OpenCode · Bob Gateway** under Engine, then a model. Use the existing profile/MCP controls and skill picker. Bob Shell remains available as an explicit alternative; failed OpenCode requests do not silently fall back.

V3 now has its own backend at 127.0.0.1:3100 and its own database under backend/data. It starts from a one-time snapshot of V2's chat database. Later V2/V3 chat changes are independent. Workspace paths still reference the same local files: this is NOT file-system isolation or an operating-system sandbox. The IDE history view remains read-only. The separate Model test view is still a tools-denied experiment.

## Behavior

- Models are discovered through the installed Bob gateway plugin. Listing may use a cached catalog; inference confirms availability.
- Selected MCP entries come from ~/.bob/settings/mcp.json. Local command/args/env and remote URL/headers are translated to OpenCode configuration. Missing environment variables, disabled or unsupported entries fail explicitly. Global/project OpenCode configuration and installed plugins also apply. Non-selected tools are denied by the dedicated agent's default permission policy; Bob-configured unselected MCP servers are disabled.
- Selected SKILL.md instructions are injected using the existing dashboard skill loader. References within that skill directory may be read. Arbitrary other skill discovery/delegation is denied. This is instruction compatibility, not a guarantee every skill script or workflow works in every model.
- Standard permissions allow native file reads and the selected MCPs' configured `alwaysAllow` tools. Edits, commands, other MCP tools, and delegation are denied. There is no interactive permission dialog yet. Selecting automatic actions for a turn additionally permits native edits/commands and all tools of the selected MCPs. Delegation and external-directory access remain restricted. Commands themselves are not sandboxed.
- New OpenCode process/session per dashboard turn; the existing bounded dashboard context (six recent messages, approximately 6,000 characters) supplies follow-ups. This is not full native OpenCode session resumption. The dashboard remains the source of conversation history.
- Responses stream through the existing lifecycle with Stop, disconnect cancellation, timeout/output bounds, visible failures, and persistence. Each OpenCode answer is labeled with its model in the saved message text.
- Attachments use the existing local file upload flow and native read tools. Generated files use the existing exact-path viewer. Their scope is the chosen workspace.
- Usage shows reported tokens, not a guessed context-window percentage or inferred Bobcoin charge. The installed plugin's automatic feedback threshold is suppressed for the child process using the same reviewed setting as Model test; global settings are not changed.

## Start

`npm run dev:all` starts V3's backend and frontend. `./start.sh` does the same. The launcher refuses occupied V3 ports and never kills V2. For this machine the backend reuses the installed bob-web dependencies through a node_modules link. On another machine install the frontend dependencies and run `npm ci` inside backend before starting. Install/sign in to OpenCode and configure your own MCP credentials locally. Set OPENCODE_BIN or BOB_BIN if their executable locations differ.

## Validation and remaining gates

Runtime and adapter tests cover cancellation/output limits, file constraints, MCP translation, missing configuration and permission defaults. A live synthetic test used the selected Vault MCP search/get tools with secure-support-engineer and saved a model-labeled answer. Synthetic upload/file tests run only in a temporary workspace.

Still validate: each support profile and remote OAuth MCP, different model tool quality, long conversations, Windows startup/cancellation, and full case/reproduction workflows. No real customer scenario was submitted for these tests. V2 is not migrated to this engine.
