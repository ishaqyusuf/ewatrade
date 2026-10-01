import { prisma } from "@ewatrade/db"
import { AccountAgeBand } from "@ewatrade/db/enums"
import {
  StoreConversationError,
  bootstrapWebStoreConversation,
  declareGuestAgeBandForCredential,
  getGuestAgeStatusForCredential,
  resumeStoreConversationForAccount,
  rotateStoreConversationGuestCredential,
} from "@ewatrade/db/queries"
import {
  isStoreConversationGuestCredentialRotationDue,
  storeConversationBootstrapInputSchema,
} from "@ewatrade/service-commerce"
import { type NextRequest, NextResponse } from "next/server"

import { getStorefrontCustomerAccount } from "@/lib/store-conversation-account-session"
import {
  STORE_CONVERSATION_GUEST_COOKIE,
  STORE_CONVERSATION_GUEST_COOKIE_OPTIONS,
  requestIsSameOrigin,
} from "@/lib/store-conversation-cookie"
import {
  STORE_CONVERSATION_GUEST_ISSUED_AT_COOKIE,
  STORE_CONVERSATION_GUEST_ISSUED_AT_COOKIE_OPTIONS,
  STORE_CONVERSATION_GUEST_ROTATION_COOKIE,
  STORE_CONVERSATION_GUEST_ROTATION_COOKIE_OPTIONS,
  createStagedStoreConversationGuestRotation,
  parseStagedStoreConversationGuestRotation,
  parseStoreConversationGuestIssuedAt,
  serializeStagedStoreConversationGuestRotation,
} from "@/lib/store-conversation-credential-rotation-cookie"

export async function POST(request: NextRequest) {
  if (!requestIsSameOrigin(request)) {
    return NextResponse.json(
      { code: "FORBIDDEN", message: "This request is unavailable." },
      { status: 403 },
    )
  }
  try {
    const body = (await request.json()) as Record<string, unknown>
    const input = storeConversationBootstrapInputSchema.parse({
      publicToken: body.publicToken,
    })
    if (
      Object.keys(body).some(
        (key) =>
          key !== "publicToken" && key !== "resetGuest" && key !== "ageBand",
      ) ||
      (body.resetGuest !== undefined && typeof body.resetGuest !== "boolean") ||
      (body.ageBand !== undefined &&
        body.ageBand !== AccountAgeBand.AGE_13_TO_15 &&
        body.ageBand !== AccountAgeBand.AGE_16_TO_17 &&
        body.ageBand !== AccountAgeBand.ADULT)
    ) {
      throw Object.assign(new Error("Invalid input"), { name: "ZodError" })
    }
    const resetGuest = body.resetGuest === true
    const account = await getStorefrontCustomerAccount(request.headers)
    if (account) {
      try {
        const resumed = await resumeStoreConversationForAccount(prisma, {
          accountUserId: account.user.id,
          publicToken: input.publicToken,
        })
        return NextResponse.json({
          access: "account",
          conversation: resumed.conversation,
        })
      } catch (error) {
        if (
          !(error instanceof StoreConversationError) ||
          error.code !== "NOT_FOUND"
        ) {
          throw error
        }
      }
    }
    const currentCredential = resetGuest
      ? null
      : request.cookies.get(STORE_CONVERSATION_GUEST_COOKIE)?.value
    const ageBand = body.ageBand as AccountAgeBand | undefined
    if (!currentCredential && !ageBand) {
      throw new StoreConversationError(
        "NOT_READY",
        "Choose an eligible age range before entering Store chat.",
      )
    }
    if (currentCredential && ageBand) {
      const guestStatus = await getGuestAgeStatusForCredential(prisma, {
        credentialToken: currentCredential,
        purpose: "WEB_DEVICE",
      })
      if (!guestStatus.eligible) {
        await declareGuestAgeBandForCredential(prisma, {
          ageBand,
          credentialToken: currentCredential,
          purpose: "WEB_DEVICE",
        })
      }
    }
    const result = await bootstrapWebStoreConversation(prisma, {
      ageBand,
      credentialToken: currentCredential,
      publicToken: input.publicToken,
    })
    const now = new Date()
    let responseCredential = result.credentialToken ?? currentCredential
    let credentialIssuedAt = parseStoreConversationGuestIssuedAt(
      request.cookies.get(STORE_CONVERSATION_GUEST_ISSUED_AT_COOKIE)?.value,
    )
    let stagedRotation = parseStagedStoreConversationGuestRotation(
      request.cookies.get(STORE_CONVERSATION_GUEST_ROTATION_COOKIE)?.value,
    )
    let rotationPrepared = false
    if (currentCredential && !result.credentialToken && stagedRotation) {
      const rotated = await rotateStoreConversationGuestCredential(prisma, {
        ...stagedRotation,
        credentialToken: currentCredential,
        now,
        purpose: "WEB_DEVICE",
      })
      responseCredential = rotated.credentialToken
      credentialIssuedAt = now
      stagedRotation = null
    } else if (
      currentCredential &&
      !result.credentialToken &&
      isStoreConversationGuestCredentialRotationDue({
        issuedAt: credentialIssuedAt,
        now,
      })
    ) {
      stagedRotation = createStagedStoreConversationGuestRotation()
      rotationPrepared = true
    } else if (result.credentialToken) {
      credentialIssuedAt = now
      stagedRotation = null
    }
    const response = NextResponse.json({
      access: "guest",
      conversation: result.conversation,
      rotationPrepared,
    })
    if (responseCredential) {
      response.cookies.set(
        STORE_CONVERSATION_GUEST_COOKIE,
        responseCredential,
        {
          ...STORE_CONVERSATION_GUEST_COOKIE_OPTIONS,
          expires: result.credentialExpiresAt,
        },
      )
    }
    if (credentialIssuedAt) {
      response.cookies.set(
        STORE_CONVERSATION_GUEST_ISSUED_AT_COOKIE,
        credentialIssuedAt.toISOString(),
        STORE_CONVERSATION_GUEST_ISSUED_AT_COOKIE_OPTIONS,
      )
    }
    if (stagedRotation) {
      response.cookies.set(
        STORE_CONVERSATION_GUEST_ROTATION_COOKIE,
        serializeStagedStoreConversationGuestRotation(stagedRotation),
        STORE_CONVERSATION_GUEST_ROTATION_COOKIE_OPTIONS,
      )
    } else {
      response.cookies.delete(STORE_CONVERSATION_GUEST_ROTATION_COOKIE)
    }
    return response
  } catch (error) {
    if (error instanceof StoreConversationError) {
      return NextResponse.json(
        { code: error.code, message: error.message },
        {
          status:
            error.code === "GUEST_CREDENTIAL_EXPIRED"
              ? 401
              : error.code === "NOT_READY" || error.code === "STORE_UNAVAILABLE"
                ? 409
                : 404,
        },
      )
    }
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json(
        { code: "INVALID_INPUT", message: "The Store link is invalid." },
        { status: 400 },
      )
    }
    return NextResponse.json(
      { code: "UNAVAILABLE", message: "The conversation is unavailable." },
      { status: 503 },
    )
  }
}
