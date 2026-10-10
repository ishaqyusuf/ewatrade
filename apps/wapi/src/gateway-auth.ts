import { createHmac, timingSafeEqual } from "node:crypto"
import type { VoiceTarget } from "./targets"

/** Origin comes from the matching private key, never an untrusted client label. */
export function authenticatedEnvironment(
  targets: VoiceTarget[],
  headers: Headers,
  path: string,
  generation: string,
) {
  const read = (name: string) => headers.get(`x-voice-${name}`) ?? ""
  const signature = read("signature")
  if (!/^[a-f0-9]{64}$/.test(signature) || read("generation") !== generation)
    return null
  const message = `${path}\n${generation}\n${read("expires")}\n${read("nonce")}\n${read("digest")}`
  for (const target of targets) {
    const expected = createHmac("sha256", target.gatewaySecret)
      .update(message)
      .digest("hex")
    if (timingSafeEqual(Buffer.from(signature), Buffer.from(expected)))
      return target.environment
  }
  return null
}
