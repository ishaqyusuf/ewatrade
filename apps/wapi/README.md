# WAPI — local Whisper API

Run from the repository root:

```sh
bun run dev --f wapi dashboard api jobs
# Just Whisper and its gateway/publisher:
bun run dev --f wapi
```

Unfiltered `bun run dev` includes WAPI automatically. Turbo's existing terminal
UI shows `@ewatrade/wapi#dev` as its own selectable task. The compatibility
command `bun run assistant:voice:local` selects the same task.

WAPI starts the existing Al-Ghurobaa Python transcriber, with its podcast queue
worker disabled and HTTP bound to loopback. It reuses a running transcriber and
never stops a borrowed process. A process it starts is shut down with the task;
failed children retry every five seconds. Cloud transcription remains the
fallback while local Whisper is unavailable or loading.

## Prerequisites and settings

Use the canonical root `.env` plus the selected root profile. Restart WAPI after
editing settings. No native/mobile app changes are needed.

| Setting | Default / purpose |
| --- | --- |
| `ASSISTANT_VOICE_LOCAL_ENABLED` | `true`; `false` keeps the TUI task idle |
| `ASSISTANT_WHISPER_SERVICE_DIR` | Sibling `../al-ghurobaa/services/transcriber` |
| `ASSISTANT_WHISPER_PYTHON` | `.venv311/bin/python` relative to service directory; absolute paths supported |
| `ASSISTANT_WHISPER_URL` | `http://127.0.0.1:8787`, loopback only |
| `ASSISTANT_WHISPER_CACHE_DIR` | `apps/wapi/.cache/whisper` for an owned process; **must explicitly match the real cache when reusing another process** |
| `WHISPER_MODEL` | Existing transcriber default `mlx-community/whisper-large-v3-turbo` |
| `ASSISTANT_WHISPER_LANGUAGE` | `en` |
| `ASSISTANT_VOICE_GATEWAY_PORT` | `8790` |
| `ASSISTANT_VOICE_TARGETS_JSON` | Mac-only array of targets below; overrides the legacy single-target settings |
| `ASSISTANT_VOICE_REGISTRY_URL` | Hosted HTTPS URL ending `/api/assistant/voice/gateway` |
| `ASSISTANT_VOICE_TARGET_ENV` | Hosted API/jobs environment; defaults to `APP_ENV` |
| `ASSISTANT_VOICE_PUBLISH_SECRET` | 32+ characters, matching the API |
| `ASSISTANT_VOICE_GATEWAY_SECRET` | Separate 32+ character HMAC secret, matching jobs |

The Al-Ghurobaa service's Python dependencies, ffmpeg and ngrok must already be
installed. WAPI does not install them. The MLX model requires supported Apple
Silicon; the first preload can download model assets through the existing
transcriber. Missing prerequisites/configuration appear in the WAPI task log;
other apps continue running. Inference remains in Al-Ghurobaa, not duplicated here.

When Whisper reports ready and tunnel settings are complete, WAPI starts the
authenticated gateway, launches ngrok with inspection disabled, publishes its
rotating URL and renews the lease. Registry startup failures retry, so API and
WAPI can start together. Only the narrow authenticated gateway is exposed;
Whisper's raw API and temporary audio download server stay on loopback.

Gateway routing, tenant enrollment, website voice flags and provider credentials
are still required for end-to-end voice. Starting this task does not enable voice
for a tenant or change hosted settings.

## Publish to every environment

Put `ASSISTANT_VOICE_TARGETS_JSON` in the selected Mac root profile as a
single-quoted JSON array. Include **all four** targets, with each environment's
real HTTPS API registry URL and matching machine credentials:

```json
[
  {"environment":"local","registryUrl":"https://<local-api>/api/assistant/voice/gateway","publishSecret":"<local API publish secret>","gatewaySecret":"<local jobs gateway secret>"},
  {"environment":"dev","registryUrl":"https://<development-api>/api/assistant/voice/gateway","publishSecret":"<development API publish secret>","gatewaySecret":"<development jobs gateway secret>"},
  {"environment":"preview","registryUrl":"https://<preview-api>/api/assistant/voice/gateway","publishSecret":"<preview API publish secret>","gatewaySecret":"<preview jobs gateway secret>"},
  {"environment":"production","registryUrl":"https://<production-api>/api/assistant/voice/gateway","publishSecret":"<production API publish secret>","gatewaySecret":"<production jobs gateway secret>"}
]
```

Replace placeholders; both secrets must be at least 32 characters, and must be
distinct across environments. Each API still uses its own
`ASSISTANT_VOICE_PUBLISH_SECRET`; each jobs runtime uses its own
`ASSISTANT_VOICE_GATEWAY_SECRET`. `environment` must match that API/jobs `APP_ENV`.
Use `production`, not `prod`, in this list. WAPI never loads/merges other root
database profiles. Keep the complete target list and credentials on the Mac only.

One ngrok URL/generation is published independently to every target's API and
database. Each target has its own compare-and-swap state. Renewals happen every
60 seconds; offline targets retry without holding up healthy targets. Shutdown
cancels an active renewal, then withdraws only this generation from each target;
unreachable leases expire after 180 seconds. Startup lists missing environments
explicitly rather than claiming they are registered. An absent target array
preserves the legacy single-target mode.

## Identify incoming requests

The gateway identifies the environment by the **verified HMAC key**, not the
caller IP or a caller-supplied environment label. Existing jobs signatures remain
compatible. Duplicate gateway keys across targets are rejected to prevent ambiguous
attribution. Expiry, nonce replay, generation and audio digest checks remain active.

Authenticated transcription responses carry `x-voice-environment` and
`x-request-id`. Existing jobs persist that request ID as the attempt's
`providerRequestId` in the originating environment's database. WAPI's TUI emits
structured metadata such as:

```json
{"event":"voice_request","environment":"preview","requestId":"<nonce UUID>","status":200,"durationMs":850}
```

No audio, transcript, secret or tunnel URL is logged. Health polls do not flood
the request log. This supplies request attribution and correlation with existing
attempt ledgers; it does not add a centralized analytics database or enable voice
for QA tenants. Shared local inference remains single-flight across environments;
busy requests use the existing cloud fallback.
