import { beforeAll, describe, expect, test } from "bun:test"
import { generateKeyPair, SignJWT } from "jose"
import { verifyAppleIdToken } from "./mobile-apple"

let keys: Awaited<ReturnType<typeof generateKeyPair>>
beforeAll(async () => { keys = await generateKeyPair("RS256") })
async function token(overrides: Record<string, unknown> = {}) {
  return new SignJWT({ sub: "apple-user", nonce: "one-time-nonce", email: "relay@privaterelay.appleid.com", email_verified: true, ...overrides })
    .setProtectedHeader({ alg: "RS256" }).setIssuer("https://appleid.apple.com")
    .setAudience("com.ewatrade.app").setIssuedAt().setExpirationTime("5m").sign(keys.privateKey)
}
async function verify(idToken: string, nonce = "one-time-nonce", audiences = ["com.ewatrade.app"]) {
  return verifyAppleIdToken({ idToken, nonce, audiences, keySet: async () => keys.publicKey })
}
describe("Apple identity token verification", () => {
  test("accepts a signed verified relay identity", async () => { expect((await verify(await token())).sub).toBe("apple-user") })
  test("rejects a different app audience", async () => { await expect(verify(await token(), "one-time-nonce", ["another.app"])).rejects.toThrow() })
  test("rejects replay into a different challenge", async () => { await expect(verify(await token(), "different-nonce")).rejects.toThrow() })
  test("rejects unverified email", async () => { await expect(verify(await token({ email_verified: false }))).rejects.toThrow() })
  test("rejects missing verification configuration", async () => { await expect(verify(await token(), "one-time-nonce", [])).rejects.toThrow() })
})
