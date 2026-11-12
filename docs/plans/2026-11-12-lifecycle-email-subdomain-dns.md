# Lifecycle email: sending subdomain setup (owner action)

Owner decision 7 (12 Nov 2026): lifecycle mail goes out from its own sending
subdomain, so marketing complaints cannot hurt login-code delivery from
`ewatrade.com`. Proposed subdomain: **`mail.ewatrade.com`**. Nothing below has been
created or changed; the owner adds it.

## 1. Add the domain in Resend

Resend → Domains → Add domain → `mail.ewatrade.com`. Use the same region as the
existing `ewatrade.com` domain. Turn **off** Resend click and open tracking for this
domain; EwaTrade tracks clicks itself through the signed `/go/:token` link.

## 2. DNS records (at the `ewatrade.com` DNS host)

Resend shows the exact values after step 1. Copy them from there; the shapes are:

| Purpose | Type | Name (host) | Value | Priority |
| --- | --- | --- | --- | --- |
| Bounce/Return-Path MX | MX | `send.mail` | `feedback-smtp.<region>.amazonses.com` (e.g. `feedback-smtp.us-east-1.amazonses.com`) | 10 |
| SPF | TXT | `send.mail` | `v=spf1 include:amazonses.com ~all` | – |
| DKIM | TXT | `resend._domainkey.mail` | `p=…` (the public key Resend generates for this domain) | – |
| DMARC | TXT | `_dmarc.mail` | `v=DMARC1; p=none; rua=mailto:dmarc@ewatrade.com; adkim=r; aspf=r; pct=100` | – |

Notes:
- Names are relative to `ewatrade.com` (some DNS hosts want the full name, e.g.
  `send.mail.ewatrade.com`).
- Start DMARC at `p=none` while warming up (monthly report first, plan §6). After
  2–4 weeks of clean reports, move to `p=quarantine`.
- `rua` needs a mailbox that exists (or a DMARC report service address).
- Do not change the existing `ewatrade.com` SPF/DKIM records; login-code mail keeps
  using them.

## 3. Webhook for delivery events

Resend → Webhooks → Add endpoint:
- URL: `https://api.ewatrade.com/api/lifecycle/webhooks/resend`
  (Preview: `https://preview-api.ewatrade.com/api/lifecycle/webhooks/resend`)
- Events: `email.delivered`, `email.opened`, `email.bounced`, `email.complained`
- Copy the signing secret into `LIFECYCLE_RESEND_WEBHOOK_SECRET`.

## 4. Environment (API + jobs; Production and Preview)

| Variable | Value |
| --- | --- |
| `LIFECYCLE_EMAIL_FROM` | `Ishaq from EwaTrade <ishaq@mail.ewatrade.com>` |
| `LIFECYCLE_EMAIL_REPLY_TO` | the support inbox (optional) |
| `LIFECYCLE_LINK_SECRET` | 32+ random characters (`openssl rand -hex 32`), different per environment |
| `LIFECYCLE_RESEND_WEBHOOK_SECRET` | from step 3 |
| `GROWTH_LIFECYCLE_ENABLED` | `false` until launch; then `true` |
| `GROWTH_LIFECYCLE_PLAYS` | optional staged rollout, e.g. `P13_monthly_report` first |

Without `LIFECYCLE_EMAIL_FROM` no lifecycle email is sent; there is deliberately no
fallback to `EMAIL_FROM`.
