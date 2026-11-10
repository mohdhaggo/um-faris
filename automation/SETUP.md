# Phase 1 — Account & hosting setup (your part)

Do these three. Each produces a credential I'll plug into the n8n workflow. None require a paid plan.

---

## A. WhatsApp Cloud API (Meta) — gives the bot a WhatsApp line

**We use the free TEST NUMBER to start.** It works immediately and needs NO business
verification — so ignore the `#2655102` "business info / policy" error for now. That error only
blocks adding a *production* number, which we don't need until launch. The informal-business
situation is fine for the test number.

1. Go to <https://developers.facebook.com> → log in → **My Apps** → **Create App** → type **Business**.
2. In the app, add the **WhatsApp** product. Meta auto-provisions a **test number** for you.
3. Open **WhatsApp → API Setup**. You'll see:
   - A **"From"** test number (the bot's line) with a **Phone number ID** under it — copy it.
   - A **temporary access token** at the top — copy it (expires in 24h; we refresh as needed).
   - The **WhatsApp Business Account (WABA) ID**.
4. **Add your own phone as a recipient.** In the **"To"** dropdown → *Manage phone number list* →
   add YOUR personal WhatsApp number → Meta sends a code to confirm it. (Test numbers can only
   message numbers you've pre-registered — up to 5. This is also a natural built-in whitelist.)
5. Hit **Send message** in that panel — you should get a "hello world" template on your phone.
   That confirms the line works.
6. Webhook (Configuration → Webhook) comes in Phase 3 — I'll give you the URL + verify token then.
   Subscribe to the **messages** field.

> Production later: once you want it live for people other than your 5 test recipients, you finish
> business verification + add a real number. The n8n workflow doesn't change — you just swap the
> Phone number ID and token. We cross that bridge at the end.

---

## B. A public home for n8n — so WhatsApp can reach the webhook

WhatsApp needs to POST to a public HTTPS URL. Pick ONE:

**Option 1 — Local Docker + Cloudflare Tunnel (recommended to start; free, 10 min):**
```bash
# 1) run n8n
docker run -d --name n8n -p 5678:5678 \
  -e N8N_HOST=localhost -e WEBHOOK_URL=https://<your-tunnel>.trycloudflare.com \
  -v n8n_data:/home/node/.n8n docker.n8n.io/n8nio/n8n

# 2) expose it publicly (install cloudflared first)
cloudflared tunnel --url http://localhost:5678
```
Cloudflared prints a `https://something.trycloudflare.com` URL — that's your public n8n.

**Option 2 — Your OCI free VM:** once the A1 instance is finally created (it's been out of
capacity in Riyadh), run the same Docker command there with a real domain. This is the long-term
home; the workflow moves over unchanged.

**Option 3 — n8n Cloud:** zero hosting, 14-day free trial then paid. Easiest but recurring cost.

---

## C. A "bot" app user — lets n8n read/write Firestore (no service account needed)

We give the bot Firestore access by signing it in as a **regular app user** (your security rule
only requires `request.auth != null`). This avoids the service-account key entirely.

1. Open your app's **Users screen (إدارة المستخدمين)** at <https://umfaris-1efca.web.app> as the admin.
2. Add a new user, e.g. **email** `bot@umfaris.com`, with a **password** you choose.
3. Give me (or paste into n8n yourself) that **email + password**. n8n signs in via the Firebase
   Auth REST API to get an ID token, then uses it for Firestore REST calls.

Firebase web config used by the workflow (these are **public**, already shipped in the web app —
safe to embed in n8n):
- **API key:** `AIzaSyAU6H9FZY0PR6-3JE3KGuwskKPbWbjwTew`
- **Project ID:** `umfaris-1efca`

> Firestore REST base: `https://firestore.googleapis.com/v1/projects/umfaris-1efca/databases/(default)/documents`
> Auth: sign in with `POST identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=<API_KEY>`
> → use the returned `idToken` as `Authorization: Bearer <idToken>` on Firestore calls.

---

## D. Gemini API key (the agent's brain — FREE)

1. Go to <https://aistudio.google.com/app/apikey> (sign in with the same Google account as Firebase).
2. **Create API key** → copy the key. No billing required (free tier).
3. Give it to me (or paste into the workflow's Code node `GEMINI_API_KEY`).

> Free-tier note: rate-limited (~15 req/min, ~1,500/day — plenty for a booking bot) and Google may
> use the data to improve its products. Acceptable for this use; revisit if handling sensitive data at scale.

## When you're done

Tell me you have:
- [ ] WhatsApp **Phone number ID** + a working access token
- [ ] A public n8n URL (from Cloudflare tunnel, OCI, or n8n Cloud)
- [ ] The Firebase service-account **JSON** downloaded

…and I'll build `workflow.n8n.json`, give you the exact webhook URL + verify token to paste into
Meta, and we test end-to-end with a message from your own (whitelisted) number.
