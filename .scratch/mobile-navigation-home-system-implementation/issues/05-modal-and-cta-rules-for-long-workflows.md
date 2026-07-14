# 05 — Modal And CTA Rules For Long Workflows

**What to build:** Oversized bottom-sheet workflows are moved to full-screen stack modals with consistent headers, keyboard-safe layout, and CTA placement.

**Blocked by:** 02 — Admin Home And Bottom Tabs; 04 — Sales-Rep Home Screen.

**Status:** ready-for-agent

- [ ] The app has a documented rule: bottom sheets are for short focused actions; content over half-screen, multi-section, or keyboard-heavy workflows use full-screen stack modals.
- [ ] At least one currently oversized bottom-sheet workflow is migrated to a full-screen modal route.
- [ ] Full-screen modal forms have consistent header, scroll body, keyboard safety, sticky primary CTA, secondary action, loading state, and validation state.
- [ ] Destructive or irreversible actions require an explicit confirmation surface.
- [ ] Existing Retail Ops behavior remains unchanged after the modal migration.
- [ ] Keyboard-open QA confirms the primary CTA stays reachable.
- [ ] Source QA verifies modal route registration and guards against reintroducing the migrated workflow as an oversized sheet.
