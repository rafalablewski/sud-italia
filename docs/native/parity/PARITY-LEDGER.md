# OttavianoKDS ↔ Web — Operator Parity Ledger

> **Generated** by `scripts/gen-native-nav.ts` — do not edit. This is the cross-reference the README's “52 of 54 surfaces” claim resolves to. Structure comes from the web nav (`src/admin-v3/nav.config.ts`, `src/core/routes.ts`); presentation (icon, blurb, live/scaffold) from `docs/native/parity/operator-nav.overlay.json`.

**55 surfaces · 10 sections · 53 live · 2 scaffold.** Each native surface mirrors the web href shown; `live` = rendered from `/api/v1`, `scaffold` = layout-parity pending facade coverage.

## Core

| Surface | Web route | Min role | State | v1 endpoint |
|---|---|---|---|---|
| POS | `/core/pos` | staff | 🟢 live | `/api/v1/admin/floor` |
| Kitchen Display | `/core/kds` | kitchen | 🟢 live | `/api/v1/admin/kds` |
| Orders | `/core/orders` | staff | 🟢 live | — |
| Guest Engagement | `/core/guest` | staff | 🟢 live | `/api/v1/admin/loyalty` |
| Service | `/core/service` | staff | 🟢 live | `/api/v1/admin/slots` |
| Book | `/core/service/book` | staff | 🟢 live | — |

## Overview

| Surface | Web route | Min role | State | v1 endpoint |
|---|---|---|---|---|
| Welcome | `/admin/welcome` | kitchen | 🟢 live | — |
| Dashboard | `/admin` | kitchen | 🟢 live | `/api/v1/admin/summary` |
| Orders | `/admin/orders` | staff | 🟢 live | — |
| Alerts | `/admin/alerts` | staff | 🟢 live | `/api/v1/admin/alerts` |
| Tasks | `/admin/comms/tasks` | manager | 🟢 live | `/api/v1/admin/tasks` |
| Announcements | `/admin/comms/announcements` | manager | 🟢 live | `/api/v1/admin/announcements` |

## Operations

| Surface | Web route | Min role | State | v1 endpoint |
|---|---|---|---|---|
| Menu | `/admin/menu` | manager | 🟢 live | `/api/v1/admin/menu` |
| Recipes | `/admin/recipes` | manager | 🟢 live | `/api/v1/admin/recipes` |
| HACCP log | `/admin/haccp` | staff | 🟢 live | `/api/v1/admin/haccp` |
| Waste log | `/admin/waste` | staff | 🟢 live | `/api/v1/admin/waste` |
| Shift handover | `/admin/handover` | manager | 🟢 live | `/api/v1/admin/handover` |

## Inventory

| Surface | Web route | Min role | State | v1 endpoint |
|---|---|---|---|---|
| Stock | `/admin/inventory` | staff | 🟢 live | `/api/v1/admin/inventory` |
| Suppliers | `/admin/suppliers` | manager | 🟢 live | `/api/v1/admin/suppliers` |
| Purchase orders | `/admin/purchase-orders` | manager | 🟢 live | `/api/v1/admin/purchase-orders` |

## People

| Surface | Web route | Min role | State | v1 endpoint |
|---|---|---|---|---|
| Staff | `/admin/staff` | manager | 🟢 live | `/api/v1/admin/staff` |
| Schedule | `/admin/schedule` | manager | 🟢 live | `/api/v1/admin/schedule` |

## Customers

| Surface | Web route | Min role | State | v1 endpoint |
|---|---|---|---|---|
| Customers | `/admin/customers` | staff | 🟢 live | `/api/v1/admin/customers` |
| Corporate | `/admin/corporate` | manager | 🟢 live | `/api/v1/admin/corporate` |
| Feedback | `/admin/feedback` | manager | 🟢 live | `/api/v1/admin/feedback` |
| Pulse surveys | `/admin/surveys` | manager | 🟢 live | `/api/v1/admin/surveys` |

## Finance

| Surface | Web route | Min role | State | v1 endpoint |
|---|---|---|---|---|
| Reports | `/admin/reports` | manager | 🟢 live | — |
| Cash | `/admin/cash` | manager | 🟢 live | `/api/v1/admin/cash` |
| Business costs | `/admin/business-costs` | manager | 🟢 live | `/api/v1/admin/business-costs` |
| Calculator | `/admin/simulation` | manager | 🟢 live | `/api/v1/admin/simulation` |

## Growth

| Surface | Web route | Min role | State | v1 endpoint |
|---|---|---|---|---|
| Campaigns | `/admin/growth` | manager | 🟢 live | `/api/v1/admin/campaigns` |
| Upsell | `/admin/upsell` | manager | 🟢 live | `/api/v1/admin/settings` |
| Cross-sell | `/admin/crosssell` | manager | 🟢 live | `/api/v1/admin/settings` |
| Scheduled bundles | `/admin/scheduled-bundles` | manager | 🟢 live | `/api/v1/admin/scheduled-bundles` |
| Events & bookings | `/admin/events` | manager | 🟢 live | `/api/v1/admin/events` |
| Integrations | `/admin/integrations` | manager | 🟢 live | `/api/v1/admin/settings` |

## Intelligence

| Surface | Web route | Min role | State | v1 endpoint |
|---|---|---|---|---|
| Multi-location | `/admin/locations` | owner | 🟢 live | `/api/v1/admin/locations` |
| Manage locations | `/admin/locations/manage` | owner | 🟢 live | `/api/v1/admin/manage-locations` |
| Menu engineering | `/admin/menu-engineering` | manager | 🟢 live | `/api/v1/admin/menu-engineering` |
| Agent HQ | `/admin/agent-hq` | manager | 🟢 live | `/api/v1/admin/agent-hq` |
| Insights | `/admin/ai` | manager | 🟢 live | `/api/v1/admin/insights` |
| Ops Agent | `/admin/ai/agent` | manager | 🟢 live | `/api/v1/admin/agent` |
| Expansion | `/admin/expansion` | owner | 🟢 live | `/api/v1/admin/expansion` |

## System

| Surface | Web route | Min role | State | v1 endpoint |
|---|---|---|---|---|
| Users & roles | `/admin/users` | owner | 🟢 live | `/api/v1/admin/users` |
| Permission matrix | `/admin/permissions` | owner | 🟢 live | `/api/v1/admin/permissions` |
| Compliance | `/admin/compliance` | manager | 🟢 live | `/api/v1/admin/compliance` |
| Regulatory disclosures | `/admin/regulatory-compliance` | owner | 🟢 live | `/api/v1/admin/regulatory` |
| SOC 2 controls | `/admin/soc2` | owner | ⚪️ scaffold | — |
| Audit log | `/admin/audit-log` | manager | 🟢 live | `/api/v1/admin/audit-log` |
| Capabilities | `/admin/capabilities` | manager | ⚪️ scaffold | — |
| Payments | `/admin/payments` | manager | 🟢 live | `/api/v1/admin/settings` |
| QR ordering | `/admin/qr-ordering` | manager | 🟢 live | `/api/v1/admin/settings` |
| Currency | `/admin/currency` | owner | 🟢 live | `/api/v1/admin/settings` |
| Languages | `/admin/languages` | owner | 🟢 live | `/api/v1/admin/settings` |
| Settings | `/admin/settings` | owner | 🟢 live | `/api/v1/admin/settings` |

## /api/v1/admin coverage

46 admin endpoints. Endpoints **not** yet mapped to a surface in this generator (review):

- `/api/v1/admin/concierge`
- `/api/v1/admin/demand-exchange`
- `/api/v1/admin/dispatch`
- `/api/v1/admin/whatsapp`
