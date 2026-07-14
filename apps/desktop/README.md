# EwaTrade Desktop

Internal Tauri wrapper for the EwaTrade dashboard. The desktop app opens the dashboard URL; dashboard workflows, auth, permissions, search, reports, and settings remain implemented by `apps/dashboard`.

## Environment Targets

- Development: `http://localhost:3094`
- Staging: `https://staging-dashboard.ewatrade.com`
- Production: `https://dashboard.ewatrade.com`

Set `DASHBOARD_URL` to override any target for local smoke checks or temporary preview deployments.

## Commands

```bash
bun --filter @ewatrade/desktop smoke
bun --filter @ewatrade/desktop tauri:dev
bun --filter @ewatrade/desktop tauri:build:dev
bun --filter @ewatrade/desktop tauri:build:prod
```

## Auth Expectation

The wrapper uses the dashboard web session. Unauthenticated users should land on the existing dashboard redirect to the marketing login page, then return to the dashboard after login.

## First Supported Platform

The first internal build target is macOS. Windows and Linux packaging should reuse the same Tauri config after icon/signing validation.

## Future Distribution Scope

Public signing, notarization, auto-update, installer artwork, app-store release, and managed enterprise distribution are not implemented in this slice.
