# 11 - Midday-Style Desktop Wrapper Internal Build

**What to build:** an internal installable desktop wrapper launches the EwaTrade dashboard with EwaTrade branding, environment targeting, and a first smoke/build check, using the Midday desktop approach as the reference.

**Blocked by:** 02 - HalalVest-Aligned Auth, Dashboard Shell, And Workspace Switching; 08 - Analytics And Reports Standardization.

**Status:** implementation-complete

- [x] Desktop wrapper strategy chooses app name, platform targets, environment URLs, auth/session expectations, icons, branding, and build profiles.
- [x] The wrapper opens the dashboard rather than reimplementing dashboard workflows.
- [x] Local/internal build instructions are documented for the first supported platform.
- [x] Desktop smoke check proves launch, environment targeting, visible EwaTrade branding, dashboard load, and auth expectation.
- [x] Public distribution items such as signing, notarization, auto-update, and store release are documented as future scope unless implemented deliberately.
- [x] Brain architecture or feature docs are updated if a desktop app/package is introduced.

## Implementation Notes

- Added `apps/desktop` as a private internal Tauri/Vite package named `@ewatrade/desktop`.
- The wrapper loads the dashboard as an external webview URL. It does not reimplement dashboard workflows, auth, permissions, reports, search, settings, or forms.
- Environment targeting uses `DESKTOP_ENV` with defaults for development, staging, and production; `DASHBOARD_URL` can override any target for preview or internal smoke builds.
- First supported platform is macOS internal builds. Signing, notarization, updater artifacts, installer artwork, public distribution, and app-store release remain future scope.

## QA Evidence

- `bun --filter @ewatrade/desktop smoke` passed and verified package name, product names, bundle ids, dashboard environment URLs, `DASHBOARD_URL` override, and external webview loading.
- `bunx biome check apps/desktop/scripts/smoke-desktop-config.ts apps/desktop/src/main.tsx apps/desktop/vite.config.ts`
- `git diff --check`
- Dashboard target smoke remains the existing web dashboard: authenticated `/settings` and `/` HTTP checks returned `200`; unauthenticated dashboard routes redirect to marketing login with `next` preserved.
- Full Tauri packaging was not run in this slice because desktop dependencies and platform signing/notarization are intentionally documented as internal/future build prerequisites.
