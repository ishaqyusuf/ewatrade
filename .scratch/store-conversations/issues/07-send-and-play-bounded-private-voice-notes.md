# 07 — Send And Play Bounded Private Voice Notes

**What to build:** Let web and mobile customers record, preview, cancel, send,
retry, and play bounded private voice notes inside the correct Store
Conversation, while authorized attendants receive them securely and voice
never substitutes for required prescription evidence.

**Blocked by:** 06 — Send Private Images And Documents Through Conversations

**Status:** ready-for-agent

- [ ] Empty composer shows a microphone; text or a ready attachment shows Send,
      and entering recording mode exposes elapsed duration, cancel, preview,
      rerecord, and send controls.
- [ ] Recording starts only after explicit action and current platform
      permission; denial, interruption, backgrounding, call/audio conflict, and
      unsupported browser/device expose safe recovery.
- [ ] Server-owned audio MIME, byte, and duration limits are validated against
      actual media metadata rather than client claims.
- [ ] Voice assets use the same private store, safety, retry, access-grant,
      audit, retention, and deletion contracts as other conversation media.
- [ ] Voice-note commit is payload-bound and idempotent; retries create one
      message/asset and concurrent replay cannot overwrite another recording.
- [ ] Authorized playback rechecks Store, participant/Membership, source,
      attachment, safety, policy, and grant expiry; expired playback offers
      reauthorization.
- [ ] Voice alone cannot satisfy a Pharmacy prescription-source requirement and
      receives no automatic transcription, summarization, intent classification,
      medical interpretation, price, or availability effect.
- [ ] Waveform/duration presentation is derived from safe metadata and never
      requires publishing the private object URL.
- [ ] Raw audio, local paths, signed URLs, object references, and content never
      enter analytics, logs, crash reports, notifications, URL state, or job
      payloads.
- [ ] Focused tests cover browser/native recording state, actual MIME/duration,
      replay, interruption, retry, quarantine, grant expiry, deletion, and
      cross-scope denial.
- [ ] Web, native, and dashboard acceptance covers keyboard/screen-reader labels,
      touch targets, compact keyboard-safe layout, playback, and unavailable-
      Store behavior.
- [ ] Brain media, API, permission, privacy, feature, and task docs record voice
      as private context rather than verified or clinical truth.
