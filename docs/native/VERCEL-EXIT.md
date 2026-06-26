# Vercel Exit — cutover plan

> Decision A (signed off): keep the Next.js/Postgres backend **and leave Vercel
> 100%**. This is the standing checklist so the migration is a config change, not
> a rewrite. The native apps never feel it because they depend only on the
> `/api/v1` contract (ARCHITECTURE §2.1), not on any host detail.

## Target shape
Run the existing Next app as a **portable Node server** — `next start` from
`output: "standalone"` in a container (Docker) behind any reverse proxy /
load balancer. Postgres stays Neon (or any Postgres). Nothing about the app
assumes Vercel.

```
[ native apps ] ──/api/v1──▶ [ reverse proxy / CDN ] ──▶ [ Next standalone (N containers) ]
                                                              │
                                              ┌───────────────┼────────────────┐
                                          [ Postgres ]   [ Redis ]   [ object store (S3) ]
```

## What's already portable (no work)
- **Persistence** — `readJSON`/`writeJSON` run on Neon **or** filesystem; no
  Vercel KV/Blob on the data path.
- **Locks / rate-limit / presence** — Upstash Redis over HTTP (portable), with
  in-process fallback.
- **The `/api/v1` contract** — relative URLs, plain-env JWT secret, SPKI pin we
  control, app reads its origin from signed remote config + baked fallback. DNS
  can move with **no App Store release**.
- **SMS / payments** — Twilio + Stripe are HTTP APIs, host-agnostic.

## Cutover checklist (the load-bearing items)
| Concern | On Vercel today | Portable replacement | Status |
|---|---|---|---|
| Compute | Serverless functions | `next build` + `output:"standalone"` → container(s) | ☐ enable standalone output |
| Cron | `vercel.json` crons → `/api/admin/cron/*` | Container scheduler (e.g. systemd timer / k8s CronJob / Cloud Scheduler) hitting the same routes with `CRON_SECRET` | ☐ |
| Edge middleware | `middleware.ts` at edge | Same `middleware.ts` runs in the Node server; verify no edge-only APIs used | ☐ audit |
| Image optimization | Vercel image CDN | `next/image` with a self-host loader, or a CDN's image resizer, or `unoptimized` | ☐ pick loader |
| Object storage | (backups already → S3) | Confirm S3-compatible for any other blobs | ✅ backups already S3 |
| CDN / TLS | Vercel edge | Any CDN (Cloudflare/Fastly) + cert; keep the SPKI the app pins under our control | ☐ provision |
| Secrets/env | Vercel env | Container env / secrets manager (plain env vars — already how we read them) | ☐ move |
| Observability | Vercel + Sentry | Sentry stays; add container logs/metrics | ☐ wire |
| Analytics | (if Vercel Analytics) | Self-host or swap | ☐ check |

## Sequence (zero-downtime)
1. **Containerize** — add `output: "standalone"` + a `Dockerfile`; run the image
   locally and against staging Postgres; smoke the full `/api/v1` suite.
2. **Stand up the new origin** in parallel (containers + proxy + CDN), pointed at
   the same Neon DB. Run both origins simultaneously (DB is the shared source of
   truth; the app is stateless beyond Redis).
3. **Move crons** to the new scheduler; disable Vercel crons to avoid double-fire
   (cron routes are idempotent / `CRON_SECRET`-gated, so brief overlap is safe).
4. **Shift traffic** by DNS/weighted routing → the new origin. Apps keep working
   (relative contract). Watch Sentry + health.
5. **Decommission** Vercel once traffic is 100% and crons confirmed.

## Apps: nothing to ship
Because the contract is the firewall, the cutover needs **no app release**:
the origin is signed remote config (with a baked fallback), pinning is to our
SPKI, and all URLs in the contract are relative. Verify post-cutover by pointing
a build at the new origin in staging and running the smoke suite.

## Pre-exit guardrails (do these now, in-repo)
- Keep **no Vercel-only primitive on a request path** — code review gate.
- Keep cron routes **idempotent + `CRON_SECRET`-gated** (they already are).
- Keep all config in **plain env vars** (no `@vercel/*` runtime reads).
- When adding a feature, prefer the portable substrate (`store.ts`, Upstash,
  Twilio/Stripe HTTP) over a managed Vercel product.
