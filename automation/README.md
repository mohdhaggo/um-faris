# Umfaris WhatsApp Agent — Design & Setup

An automation that lets you manage the Umfaris booking app **by chatting on WhatsApp**.
You send a request in plain Arabic ("احجزي يوم ١٥ يوليو لمنيرة، ٥٠ معزوم")؛ a Claude agent
understands it, runs the matching action against Firestore, and replies that it's done.

It only responds to **whitelisted phone numbers** — random/unknown conversations are ignored.

## Stack (decided)

| Layer            | Choice                                                                 |
|------------------|-----------------------------------------------------------------------|
| WhatsApp channel | **WhatsApp Cloud API** (official, Meta) — free tier                    |
| Orchestrator     | **n8n** (self-hosted)                                                  |
| Brain            | **Google Gemini** (`gemini-2.0-flash`, free tier) with function-calling |
| Action layer     | Firestore **REST API** + a Google **service account** (free, no Blaze) |
| Data             | Existing Firestore project `umfaris-1efca`, `bookings` collection      |

## Flow

```
WhatsApp message
   │
   ▼
[1] n8n webhook  ──►  [2] Whitelist gate ──(not allowed)──► ignore (no reply)
                              │ allowed
                              ▼
                     [3] Claude agent (system prompt + tools)
                              │  picks a tool, may ask a follow-up
                              ▼
                     [4] Tool runs against Firestore REST
                              │
                              ▼
                     [5] Agent replies in Arabic via WhatsApp ("تم الحجز ✅")
```

## Safety model

- **Whitelist first.** The sender's number is checked against `allowedContacts` in Firestore
  *before* the agent ever runs. Unknown numbers get no reply at all.
- **Fixed toolset.** The agent can ONLY call the tools defined in `agent-spec.md`. It can
  never run arbitrary Firestore writes, touch `users`, or change app settings.
- **Confirm before writing.** For any create/edit/cancel, the agent first replies with a
  summary and waits for your ✅ (or "تأكيد"). Only then does it write. Reads run immediately.
- **Service account is server-side only.** The key lives in n8n credentials, never in the app
  or in WhatsApp.

## What lives where

| File                    | Purpose                                                            |
|-------------------------|-------------------------------------------------------------------|
| `README.md`             | This document.                                                    |
| `agent-spec.md`         | Claude system prompt + the exact tool definitions (the core IP).  |
| `SETUP.md`              | Step-by-step account setup (Meta, n8n hosting, service account).  |
| `workflow.n8n.json`     | Importable n8n workflow (added in Phase 3).                       |

## Status

- [x] Phase 2 design — agent prompt + tools mapped to the real schema (`agent-spec.md`)
- [ ] Phase 1 — your accounts (see `SETUP.md`)
- [ ] Phase 3 — build & import the n8n workflow, end-to-end test
