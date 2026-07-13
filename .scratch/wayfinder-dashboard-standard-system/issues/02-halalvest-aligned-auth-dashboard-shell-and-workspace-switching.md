# 02 - HalalVest-Aligned Auth, Dashboard Shell, And Workspace Switching

**What to build:** a web user can sign up or log in through a HalalVest-aligned dashboard auth flow, land in a Midday-style dashboard shell, and switch between permitted businesses and stores while route visibility respects their role.

**Blocked by:** 01 - Dashboard Reference Audit And Adoption Blueprint.

**Status:** ready-for-agent

- [ ] Web auth behavior is aligned with the HalalVest reference while preserving EwaTrade tenant, store, session, membership, and role boundaries.
- [ ] Authenticated users land in a Midday-style dashboard shell with sidebar, header, profile/sign-out, and workspace controls.
- [ ] Business and store switching updates the active context used by dashboard reads and mutations.
- [ ] Owner/admin, manager, and attendant roles see only the navigation surfaces they are permitted to use.
- [ ] Existing dashboard route-handler bridges are documented as retained, migrated, or removed.
- [ ] Browser workflow QA covers sign up or login, shell load, role-aware navigation, business switching, store switching, and sign out.
- [ ] Brain API, feature, or architecture docs are updated if auth/session/workspace behavior changes.
