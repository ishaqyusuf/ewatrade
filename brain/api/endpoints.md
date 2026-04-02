# API Endpoints

## Purpose
Track current and planned API surface areas.

## How To Use
- Update when routes or procedure groups are added or changed.

## Current State
- `apps/marketing` exposes public POST routes for marketing lead capture:
  - `POST /api/early-access`
  - `POST /api/waitlist`

## Planned Domains
- Auth
- Tenants and memberships
- Stores and catalog
- Orders and checkout
- Delivery requests and dispatch bids
- Websites, pages, and themes
- Marketplace discovery
- Messaging and notifications

## TODO
- Replace planned domains with concrete Hono routes and/or tRPC routers once created.
