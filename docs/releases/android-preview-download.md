# Android Preview download

`https://preview.ewatrade.com/apk` reads the same revisioned Preview build registry
as the mobile updater and redirects to its active, validated Expo APK. It performs
no database writes and needs no publisher token. Marketing and API Preview must
use the same Preview database. Responses are uncached: replacement takes effect
on the next request and withdrawal returns 404. Registry errors return a generic
503 with Retry-After; non-Preview deployments return 404 before reading a build.

The existing root Android Preview build command waits for the exact completed
EAS build, rechecks project/profile/channel/source, hashes the APK, and publishes
it to the API. That publication also changes `/apk`; no hardcoded APK URL or
second publication step is needed.

```
bun run eas:build --preview --platform android --expected-commit <full-sha> --non-interactive
bun app:update status --backend preview
```

Older installations without the updater need a one-time installation from `/apk`.
Android requires installation confirmation. An update must retain the application
ID and signing certificate to preserve local data and the login session.

Validation includes registry publication/withdrawal, strict destination validation,
Preview-only serving, safe download errors, updater client scenarios and release
runner regressions. Signed-device installation and live URL verification are
separate release acceptance checks.

The native build check uses AbortController with an 8-second timer because React
Native's AbortSignal does not provide timeout(). Actual-client scenarios run with
that static method unavailable and verify an aborted request. Device acceptance
found this compatibility gap before final release; build29 was withdrawn while
the corrected OTA and APK were prepared.
