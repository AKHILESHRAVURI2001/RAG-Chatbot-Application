# Widget Runtime Architecture & Code Flow

Comprehensive code flow and architecture reference for `@minichatbot/widget` (Standalone Vanilla TypeScript IIFE Bundle).

---

## 1. Widget Lifecycle & DOM Injection Flow

```mermaid
sequenceDiagram
    autonumber
    actor Visitor
    participant Browser as Client Browser
    participant Script as src/widget.ts (IIFE)
    participant Styles as src/widget.css
    participant Server as Backend Server (/api)
    
    Browser->>Script: Browser executes <script src="widget.js" data-api="..." defer>
    Script->>Script: Read dataset attributes (apiBase, documentId?, tag?)
    Script->>Server: GET /api/health
    
    alt API Unhealthy / Network Down
        Server-->>Script: 500 / Network Error
        Script-->>Browser: Abort silently (no broken UI shown on host site)
    else API Healthy
        Script->>Server: GET /api/chat/widget-config
        Server-->>Script: { primaryColor, title, greeting, enabled, voiceEnabled, quickReplies, ... }
        
        Script->>Styles: Apply :root { --mcb-primary: primaryColor } + widget.css
        Script->>Browser: Inject <style> tag into <head>
        Script->>Browser: Create and append .mcb-bubble and .mcb-window to <body>
        
        alt Proactive Callout Enabled & Unopened
            Script->>Browser: Display proactive callout after proactiveDelaySeconds
        end
    end
    
    Visitor->>Browser: Clicks .mcb-bubble or callout
    Browser->>Script: Bubble click event fires
    Script->>Browser: Toggle .open class on .mcb-window & trap keyboard focus
    
    alt First Open on Page Load
        Script->>Server: GET /api/chat/history?sessionId=...
        alt Existing History
            Server-->>Script: Rehydrate past conversation turns
        else No Prior History
            Script->>Browser: Render greeting bubble + quick reply chips
        end
    end
```

---

## 2. Typed Message Submission Flow (`send`)

```mermaid
flowchart TD
    UserAction[User types message & hits Enter / clicks Send button] --> CheckEnabled{config.enabled?}
    
    CheckEnabled -- No (Closed / Disabled) --> AbortAction[Abort submission & keep input locked]
    CheckEnabled -- Yes --> StartSend[handleSend: Extract input value & clear text field]
    
    StartSend --> RemoveQuickReplies[Remove .mcb-quick-replies chips from DOM]
    RemoveQuickReplies --> ToggleStopButton[Change Send button to Stop button]
    ToggleStopButton --> AppendUserMsg[addMessage: Append user message bubble to transcript]
    AppendUserMsg --> AppendTyping[Append animated typing indicator bubble]
    
    AppendTyping --> TimeoutSetup[withTimeout: Attach 45s hard timeout + AbortController]
    TimeoutSetup --> APIFetch[POST /api/chat with sessionId, message, documentId, tag]
    
    APIFetch --> ResponseCheck{Response Status}
    
    ResponseCheck -- 200 OK --> RemoveTyping[Remove typing indicator]
    RemoveTyping --> FormatAnswer[formatChatMarkdown: Parse markdown bold, lists, and related cards]
    FormatAnswer --> RenderBotMsg[addMessage: Append assistant bubble]
    
    ResponseCheck -- Abort / User Stop --> SilentStop[Clean typing indicator silently]
    ResponseCheck -- Error (503 / 429 / Net) --> RenderError[addErrorMessage: Render alert card with '↻ Try again' button]
    
    RenderBotMsg & SilentStop & RenderError --> ResetSendButton[Restore Send button icon]
```

---

## 3. Spoken Voice & Continuous Conversation Flow

```mermaid
sequenceDiagram
    autonumber
    actor Visitor
    participant Widget as src/widget.ts
    participant AudioCtx as Web Audio Analyser
    participant Server as /api/chat/voice & /api/chat/speak
    
    Visitor->>Widget: Clicks Mic Button
    Widget->>Widget: request navigator.mediaDevices.getUserMedia({ audio: true })
    Widget->>Widget: Open .mcb-voice-overlay (visual ring & live volume meter)
    Widget->>AudioCtx: Start volume meter RAF loop (detects speech & silence)
    
    alt Silence > 2000ms after speaking (Auto-Submit)
        AudioCtx->>Widget: Auto-stop recording
    else User clicks "Stop & send"
        Visitor->>Widget: Clicks stop button
    end
    
    Widget->>Server: POST /api/chat/voice (FormData with audioBlob)
    Server-->>Widget: { transcript, answer, source, audio?: { base64, format } }
    
    Widget->>Widget: Render transcript (user bubble) & answer (bot bubble)
    
    alt Spoken Audio Returned (TTS)
        Widget->>Widget: Play audio element (voicePhase = 'speaking')
        Widget->>AudioCtx: Start bargeInStream listener (detects user speaking over bot)
        alt User speaks during playback (Barge-In)
            AudioCtx->>Widget: Barge-in detected -> Cut off audio & start fresh recording
        else Audio finishes playing
            Widget->>Widget: continueListeningAfter() -> Resume listening loop
        end
    end
```

---

## 4. Function & Event Handlers Index

| Function | Line Scope | Purpose |
|---|---|---|
| `init()` | Boot | Reads script tag attributes, checks API health, fetches configuration, and mounts DOM elements. |
| `formatChatMarkdown()` | Message Render | HTML-escapes text, parses bold, converts bullet points to lists, and transforms `Related articles:` into card grids. |
| `send()` | Q&A Pipeline | Dispatches chat requests, manages typing indicators, abort signals, timeouts, and error retry cards. |
| `startRecording()` / `sendVoice()` | Voice Input | Controls Web Audio recording, volume animation, interim browser captions, and server upload. |
| `cancelRecording()` | Voice Exit | Halts recording/playback, disarms mic, and returns to chat view via the "Back to chat" button. |
| `listenForBargeIn()` | Interruption | Monitors secondary microphone stream during bot speech to enable immediate conversation barge-in. |
| `trapFocus()` | Accessibility | Traps keyboard focus (`Tab` / `Shift+Tab`) and handles `Escape` key inside open widget dialog. |
