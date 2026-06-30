# Going live — a plain-language guide

The apps are built. What's left to make them fully work in the real world isn't
coding — it's **switching features on** by adding a few keys (think of them as
passwords) in your hosting dashboard. This guide explains, in plain terms, what
each one does, where to get it, and how to confirm it worked.

> **The single source of truth for what's on:** open **`/admin/capabilities`** in
> the app. Every feature shows a colour — **green = live**, **amber = needs a key**,
> **grey = off**. As you add keys below, those flip to green. You never have to
> guess.

> **Where do these keys go?** Wherever the app is hosted (e.g. Vercel) there's a
> "Environment Variables" screen. Each key below is a NAME and a VALUE you paste
> there, then redeploy. If you have a technical helper or an AI deploy session,
> hand them this file — each section is self-contained.

---

## 0. The bare minimum to run
| Key | What it's for | Where to get it |
|---|---|---|
| `ADMIN_PASSWORD` | The owner login for the operator app / admin | You choose it (make it long) |
| `SESSION_SECRET` | Keeps logins secure | Any long random string |
| `NEXT_PUBLIC_BASE_URL` | Your live web address | e.g. `https://ottaviano.pl` |

With just these, the apps run in **demo mode** (data lives on the server's disk,
no payments). Good for a look; not for real trading. Add the database next.

## 1. Real data — Database (Neon Postgres)
**What it does:** stores orders, customers, loyalty points, menu — for real,
permanently, across devices. Without it the app forgets everything on redeploy.

| Key | Where to get it |
|---|---|
| `DATABASE_URL` | Sign up at **neon.tech** (free tier is fine to start) → create a database → copy its connection string |

**Verify:** `/admin/capabilities` → "Postgres substrate" turns green.

## 2. Taking payment — Stripe (cards + Apple Pay)
**What it does:** takes real card and **Apple Pay** payment at checkout. Apple Pay
appears automatically on iPhones — no extra setup beyond the step below.

| Key | Where to get it |
|---|---|
| `STRIPE_SECRET_KEY` | **stripe.com** → Developers → API keys → "Secret key" |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Same screen → "Publishable key" |
| `STRIPE_WEBHOOK_SECRET` | Stripe → Developers → Webhooks → add endpoint `https://YOURSITE/api/webhook` → copy its "Signing secret" |

**One extra click for Apple Pay:** in Stripe → Settings → Payment Methods → Apple
Pay → **add your web domain** (Stripe walks you through it). That's the only thing
standing between you and Apple Pay in the customer app.

**Verify:** `/admin/capabilities` → payment entries turn green; place a test order.

## 3. "Your pizza is ready 🍕" + "New order" alerts — Push (VAPID)
**What it does:** the customer app pings the guest when their order is ready; the
operator app (OttavianoKDS) pings the kitchen tablet when a new order lands. The
opt-in buttons are already in both apps — they appear once these keys are set.

| Key | Where to get it |
|---|---|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` | A technical helper runs one command — `npx web-push generate-vapid-keys` — which prints both. Paste each into the matching key. |
| `VAPID_SUBJECT` | `mailto:you@yourbusiness.com` |

**Important companion (see §7):** customer "ready" pushes are *sent* by a
scheduled job, so push only fully works once **Scheduled jobs** (§7) are on too.
Operator "new order" pushes fire immediately and don't need that.

**Verify:** open the operator launcher (`/operator`) → tap **Enable order alerts**;
open a customer receipt → tap **Notify me when ready**. Both buttons only show
when these keys are set.

## 4. Text messages — SMS (Twilio)
**What it does:** texts guests "order placed / ready" (alongside push), for guests
who don't install the app.

| Key | Where to get it |
|---|---|
| `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` | **twilio.com** → Console dashboard |
| `TWILIO_FROM` | A phone number you buy in Twilio (the "from" number) |

**Verify:** `/admin/capabilities` → SMS turns green.

## 5. Email receipts (Mailgun)
**What it does:** emails order receipts.

| Key | Where to get it |
|---|---|
| `MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, `MAILGUN_FROM` | **mailgun.com** → after verifying your sending domain |
| `MAILGUN_REGION` | `EU` or `US` (matches your Mailgun account) |

## 6. Speed & reliability under load (Upstash Redis) — optional
**What it does:** stops two guests grabbing the last slot at once, and keeps things
fast at busy times. Optional — the app works without it at low volume.

| Key | Where to get it |
|---|---|
| `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` | **upstash.com** → create a Redis database → REST section |

## 7. Scheduled jobs — IMPORTANT for push/SMS delivery
**What it does:** runs background work on a timer — most importantly **delivering
the "order ready" pushes and texts** (they're queued, then sent by this job),
plus nightly backups and reminders.

| Key | What to do |
|---|---|
| `CRON_SECRET` | Any long random string. Then your host's scheduler (e.g. Vercel Cron, already configured in `vercel.json`) calls the job endpoints on a timer using this secret. |

Without this, the "ready" push/text is created but never sent. (Operator
new-order push doesn't depend on it.)

## 8. Nice-to-haves
| Feature | Keys | What it adds |
|---|---|---|
| AI ops assistant | `ANTHROPIC_API_KEY` | The in-admin assistant + AI insights |
| Error monitoring | `SENTRY_DSN` | You get alerted if something breaks |
| Extra login security | `ADMIN_TOTP_SECRET` | Two-factor code on the owner login |
| Off-site DB backups | `BACKUP_S3_*` | Nightly database backup to cloud storage |

---

## A realistic order to do this in
1. **Deploy** + §0 keys → the apps are online (demo).
2. **§1 Database** → real, persistent data.
3. **§2 Stripe** (+ Apple Pay domain) → you can take money.
4. **§7 Scheduled jobs** + **§3 Push** + **§4 SMS** → guests get "ready" alerts.
5. Everything else as you need it.

After each step, check `/admin/capabilities` — the feature turns green. That page
is your live checklist.

---

## About the native App Store apps
There are two ways to put Ottaviano / OttavianoKDS on a device:

1. **Installable web apps (PWAs)** — add to the iPhone/iPad/Android home screen,
   run full-screen, no App Store and no extra account needed. The complete
   zero-setup path, and the only path for non-Apple devices.
2. **Native iOS apps** — real, signable apps under `native/ottaviano-ios/`. Each
   is a pure-UIKit `WKWebView` shell that renders the live web app, so it reflects
   the web 1:1 (no separate UI to maintain — see `docs/native/README.md`).
   Shipping them additionally requires an **Apple Developer account** (~$99/yr, in
   your name — Apple verifies your identity, so this step can't be done for you)
   plus a Mac/CI to build and sign (`Scripts/testflight.sh`,
   `.github/workflows/ios*.yml`). OttavianoKDS goes through Apple Business Manager
   (internal staff tool); the public Ottaviano app also needs in-app Stripe
   checkout and a web customer account-deletion page before review (5.1.1(v)).
