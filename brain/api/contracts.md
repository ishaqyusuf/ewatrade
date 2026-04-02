# API Contracts

## Purpose
Track important request/response shapes and contract rules.

## How To Use
- Update when API payloads or validation schemas change.

## Contract Rules
- Keep tenant context explicit in authenticated flows.
- Prefer shared validation/schema packages for API boundaries.
- Hide repository/ORM details from API responses.

## Current State
- Marketing lead capture contracts:
  - `POST /api/early-access` accepts `fullName`, `email`, and optional `companyName`, `roleTitle`, `phone`, `message`
  - `POST /api/waitlist` accepts `fullName` and `email`
  - Both routes return a simple success `message` on success and still keep notification/email side effects server-side
