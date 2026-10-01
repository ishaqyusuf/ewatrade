# Apple App Store Server verification roots

These public DER certificates were downloaded on 27 September 2026 from the
[Apple PKI root certificates](https://www.apple.com/certificateauthority/), as
directed by the [Apple App Store Server Node.js library](https://github.com/apple/app-store-server-library-node#obtaining-apple-root-certificates).
They are trust anchors for `SignedDataVerifier`, not signing keys or developer
credentials.

| File | Apple source | SHA-256 DER fingerprint |
| --- | --- | --- |
| `AppleIncRootCertificate.cer` | `https://www.apple.com/appleca/AppleIncRootCertificate.cer` | `B0:B1:73:0E:CB:C7:FF:45:05:14:2C:49:F1:29:5E:6E:DA:6B:CA:ED:7E:2C:68:C5:BE:91:B5:A1:10:01:F0:24` |
| `AppleRootCA-G2.cer` | `https://www.apple.com/certificateauthority/AppleRootCA-G2.cer` | `C2:B9:B0:42:DD:57:83:0E:7D:11:7D:AC:55:AC:8A:E1:94:07:D3:8E:41:D8:8F:32:15:BC:3A:89:04:44:A0:50` |
| `AppleRootCA-G3.cer` | `https://www.apple.com/certificateauthority/AppleRootCA-G3.cer` | `63:34:3A:BF:B8:9A:6A:03:EB:B5:7E:9B:3F:5F:A7:BE:7C:4F:5C:75:6F:30:17:B3:A8:C4:88:C3:65:3E:91:79` |

These files are the auditable source copies. The same DER bytes are embedded as
`apps/api/src/billing/apple-root-certificates.json` in the API bundle. The
runtime verifies their pinned SHA-256 fingerprints and self-signatures before
passing them to `SignedDataVerifier`. It needs no filesystem path or
`APPLE_ROOT_CA_PATHS` variable. The local billing preflight validates the
embedded JSON; a signed sandbox purchase still needs separate verification.
