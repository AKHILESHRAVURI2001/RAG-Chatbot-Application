# Widget

The chat bubble that visitors see on your website. It builds into one file, `widget.js`, that works on any site with a single `<script>` line. No framework needed.

## Add it to a website

```html
<script src="https://your-host/widget.js" data-api="https://your-api.com/api" defer></script>
```

- `src` — where you uploaded `widget.js`
- `data-api` — your server's address ending in `/api`

That's all you need. Colors, greeting, quick replies, opening hours, voice and the sign-up step are set in the **admin panel**, not in this tag.

### Optional settings in the tag

| Attribute | What it does |
| --- | --- |
| `data-title` | Change the title at the top |
| `data-primary-color` | Change the main color, e.g. `#4f46e5` |
| `data-icon` | Change the avatar (an image address or an emoji) |
| `data-document-id` | Answer only from one document |
| `data-tag` | Answer only from documents with this tag |

Example — a chat that only knows about billing:

```html
<script src="https://your-host/widget.js" data-api="https://your-api.com/api" data-tag="billing" defer></script>
```

The website must be listed in `ALLOWED_ORIGINS` on the server.

## Build it

```bash
npm run build     # creates dist/widget.js
npm run dev       # live preview at http://localhost:5175
```

There is no `.env` file to set up. The widget gets its settings from the tag and from the server.

## How a message flows

```
 Visitor types -> Widget -> Server finds the answer -> Widget shows the reply (with its time)
```

## Voice

The microphone button starts a hands-free voice conversation: the visitor speaks, the bot answers out loud, then listens again. The full flow, with a diagram, is in [`../../docs/VOICE.md`](../../docs/VOICE.md). The code is `src/core/voiceChat.ts`.

## What visitors see

- Each message shows the time it was sent or received.
- A thin colored edge on the bot's replies shows where the answer came from.
- It works with the keyboard (Tab to move, Escape to close).

## Where things are (`src/`)

| File / folder | What it is |
| --- | --- |
| `widget.ts` | Starts the widget |
| `core/chatWidgetController.ts` | What the widget does |
| `services/` | Talking to the server, saving the session, voice |
| `ui/` | Drawing the chat window |
| `widget.css` | The look |

More: how it works inside — [`docs/flow.md`](docs/flow.md). Putting it online — upload `dist/widget.js` to any static host or CDN ([`../../docs/hostingsupport/`](../../docs/hostingsupport/)).
