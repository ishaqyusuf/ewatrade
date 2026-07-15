# 06 — Shared Input And Form Density Cleanup

**What to build:** Mobile forms reuse the stable login/signup input foundation and remove excessive nested card/border wrappers from form bodies.

**Blocked by:** 05 — Modal And CTA Rules For Long Workflows.

**Status:** implementation-complete; runtime keyboard QA pending

- [x] A canonical mobile form input path is documented and reused across auth, sheets, modals, and dashboard forms.
- [x] Forms reuse the stable login/signup input styling and behavior where input is needed.
- [x] At least the migrated full-screen modal and one short bottom sheet use the canonical input path.
- [x] Unnecessary nested card/border wrappers are removed from touched forms.
- [x] Form grouping uses spacing, labels, helper text, dividers, and CTA hierarchy instead of repeated bordered cards.
- [ ] Keyboard-safe behavior is preserved for normal inputs, numeric inputs, and multiline inputs.
- [x] Source QA checks shared input reuse and wrapper-density guardrails for touched forms.
