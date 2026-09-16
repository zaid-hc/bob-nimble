# V2 frontend sync into V3 — September 12, 2026

V3 now uses V2's current frontend as its base. Source files are copied unchanged except App.tsx (V3 view selector and experiment routing) and types.ts (legacy ShellSession type). V3-only code is isolated in legacy-api.ts, experiments.css, and ModelLab/ShellPrototype/IdeHistory components. Existing Vite IDE bridge and model-lab middleware remain in place on loopback port 3002.

Carried over: current navigation and reproduction tools, workspace folder selection, file/Markdown/Confluence viewer, resizing and wrapping, attachments, response copy/share, thinking tips, themes, usage display, and authenticated streaming/cancellation/error handling.

Preserved experiments: model test, Bob Shell native sessions, read-only IDE conversation history. Access them using the header view selector. Leaving a running experiment requests cancellation. Normal Chat remains on Bob Shell; this sync does not connect MCPs/skills to OpenCode.

The backend on port 3000 and its data were not changed. Normal V2 and V3 Chat continue to share the existing backend; actions in either normal chat affect that shared conversation store. Model tests have separate OpenCode history. IDE history is read-only.

Validation: production build and four copied V2 transport tests (node --test beta-api.test.mjs). V3 retains its dependency versions and package lock. Windows and full real-agent workflows still need beta validation.

Original V3 source, index, and notes are backed up in .backups/v2-sync-ilVAGL with a manifest. No source files or databases were deleted.
