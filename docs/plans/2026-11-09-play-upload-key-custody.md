# Existing Android upload-key custody review

Prepared9November2026; **export not approved or performed**. The Android upload
keystore signs app bundles. The separately approved Google Publisher credential
verifies purchases. This review concerns an additional local copy of the existing
upload signer, not another Publisher key.

## Verified source and need

The reviewed Play Preview profile selects local credentials, and
`scripts/check-play-preview.mjs` requires an actual local keystore certificate
matching the registered upload certificate. The current ignored mobile credentials
file exists but has no Android keystore entry. Its iOS contents were not printed.

A narrow read-only EAS metadata query used the existing CLI session and requested
no keystore bytes or passwords. It confirmed project
`532f9a55-f4f6-4d4e-b60b-ea6fa8807a3b` (`@cipron-startups/ewatrade`), package
`com.ewatrade.app`, one default **Build Credentials YFq5P9QhyC**, type **JKS**,
updated9July2026. Its public SHA256 exactly matches the certificate independently
extracted from uploaded AAB36:

`615376C3C2035220230FD645C270630026BD0DFFBB62722B88CF10396AD5409E`.

Private metadata-only receipt:
`/private/tmp/ewatrade-eas-public-android-signer-2026-11-09.evidence.json`.
This proves a matching existing provider signer, not local custody or authorization
to create a new build.

## Proposed bounded export

- Retrieve only that matching existing EAS upload keystore and its signing fields.
- Store the JKS only at the ignored protected local path
  `.scratch/android-paid-launch-release/private/preview/play-upload-keystore.jks`,
  directory0700/file0600.
- Add only the corresponding Android entry to existing ignored
  `apps/mobile/credentials.json`, protected0600. Preserve all iOS fields; check
  for concurrent file changes before writing and verify preserved iOS data after.
- Verify the actual downloaded certificate with the existing local keytool check.
  Keep key bytes and passwords out of terminal output, screenshots, Git, Brain,
  messages and review notes. Do not create a second password-bearing review copy.

This places a signing credential on this Mac. Possession can be used to sign
future bundles, although Play upload/publication access remains separately
controlled. Approval would authorize this additional credential copy and local
Android configuration only. No new signer, rotation, deletion, Expo credential
reassignment, cloud build, upload/distribution, subscription activation or
deployment is included. Stop on an unexpected signer or existing Android entry;
do not alter another agent's credential configuration.

## Other acceptance remains

API Preview local isolation/project-link preflight passes. The proposed six-entry
Apple/Play catalog passes the existing schema and pure Play profile validator,
but current hosted catalog equality is still unproven. Its write remains gated;
root supplied a dated accepted Apple source, not a new hosted-value read. Preserve
the hosted catalog, Production Sandbox refusal and the newly verified Play RTDN
off state. The exact committed build/runtime candidate must still pass normal
release checks before the next build/deployment review.
