# Debugging: watch the code run instead of just reading it

Reading `chatService.ts` tells you what the code *should* do. Attaching a real debugger and watching it execute, one line at a time, on a real request is what actually makes the flow click. This project has a ready-to-use VS Code debug config at `.vscode/launch.json` — you don't need to set anything up.

## Requirement: open the right folder

VS Code only finds `.vscode/launch.json` if the folder you opened **is** `minichatbotagent` itself (the folder containing `apps/`, `docs/`, `package.json`) — not a parent folder above it, and not a subfolder like `apps/server` inside it. If pressing `F5` shows a generic "Select debugger" picker instead of a config named **"Debug Server"**, this is almost always why: **File → Open Folder** → select `minichatbotagent` directly.

## Two ways to run it

**Option A — fastest, zero setup:**
1. Set a breakpoint (click just left of a line number — a red dot appears).
2. `Ctrl+Shift+P` → **"Debug: JavaScript Debug Terminal"**.
3. In that terminal: `cd apps/server` then `npm run dev`.
4. Trigger the code (ask the widget a question, use the admin panel) — VS Code pauses on your breakpoint automatically.

**Option B — one key, every time (recommended to build the habit):**
1. Set your breakpoint(s) first.
2. `Ctrl+Shift+D` to open Run and Debug.
3. Pick **"Debug Server"** from the dropdown, press the green ▶ (or `F5`).
4. Trigger the code from the widget/admin.

## Once it's paused

| Panel / key | What it's for |
| --- | --- |
| **Variables** (left panel) | Every variable's live value at this exact line. Expand objects to dig in. |
| `F10` Step Over | Run the current line, stop at the next one. Use this most. |
| `F11` Step Into | If the current line calls a function you want to follow *inside*, jump there. |
| `Shift+F11` Step Out | Finish the current function, pop back to whoever called it. |
| `F5` Continue | Stop stepping, run until the next breakpoint (or the end). |
| **Call Stack** panel | Exactly which function called which — read top to bottom, this *is* "the flow." |

## Two exercises worth doing

**1. Watch every single API call, one place.** Every request into the server passes through the very first `app.use(...)` in `apps/server/src/index.ts` before any routing happens. Put one breakpoint on the first line inside it, then press **Continue (`F5`)** repeatedly — each press lets one request finish and pauses on the *next* one that arrives, from any app, any endpoint. Check `_req.url` in the Debug Console to see which request just came in.

**2. Watch the answer pipeline execute.** Put a breakpoint on the first line inside `answerQuestion` in `apps/server/src/features/chat/chatService.ts`, run in debug mode, and ask the widget a question. Use **Step Over** repeatedly — you'll watch restricted words → exact cache → FAQ → question chunks → semantic cache → LLM happen in order, line by line, with the real values in the Variables panel at each step.
