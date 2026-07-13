# 11 - Midday-Style Desktop Wrapper Internal Build

**What to build:** an internal installable desktop wrapper launches the EwaTrade dashboard with EwaTrade branding, environment targeting, and a first smoke/build check, using the Midday desktop approach as the reference.

**Blocked by:** 02 - HalalVest-Aligned Auth, Dashboard Shell, And Workspace Switching; 08 - Analytics And Reports Standardization.

**Status:** ready-for-agent

- [ ] Desktop wrapper strategy chooses app name, platform targets, environment URLs, auth/session expectations, icons, branding, and build profiles.
- [ ] The wrapper opens the dashboard rather than reimplementing dashboard workflows.
- [ ] Local/internal build instructions are documented for the first supported platform.
- [ ] Desktop smoke check proves launch, environment targeting, visible EwaTrade branding, dashboard load, and auth expectation.
- [ ] Public distribution items such as signing, notarization, auto-update, and store release are documented as future scope unless implemented deliberately.
- [ ] Brain architecture or feature docs are updated if a desktop app/package is introduced.
