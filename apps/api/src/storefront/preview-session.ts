import { TRPCError } from "@trpc/server"
import { SignJWT, jwtVerify } from "jose"
import type { StorefrontActor } from "./site-commands"

function key() {
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret || secret.length < 32)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Storefront preview signing isn't configured.",
    })
  return new TextEncoder().encode(secret)
}

export async function createStorefrontPreviewSession(
  actor: StorefrontActor,
  scope: { siteId: string; storeId: string; draftRevision: number },
) {
  const expiresAt = Date.now() + 5 * 60_000
  const session = await new SignJWT({ tenantId: actor.tenantId, ...scope })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(actor.actorUserId)
    .setIssuer("ewatrade")
    .setAudience("storefront-preview")
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt / 1000))
    .sign(key())
  return { session, expiresAt }
}

export async function verifyStorefrontPreviewSession(
  session: string,
  actor: StorefrontActor,
) {
  try {
    const { payload } = await jwtVerify(session, key(), {
      algorithms: ["HS256"],
      issuer: "ewatrade",
      audience: "storefront-preview",
    })
    if (
      payload.sub !== actor.actorUserId ||
      payload.tenantId !== actor.tenantId ||
      typeof payload.siteId !== "string" ||
      typeof payload.storeId !== "string" ||
      !Number.isSafeInteger(payload.draftRevision)
    )
      throw new Error("scope")
    return payload
  } catch {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message:
        "This preview expired or changed. Open a fresh preview from the studio.",
    })
  }
}
