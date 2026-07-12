import { describe, expect, test } from "bun:test"
import { TRPCError } from "@trpc/server"
import { verifyGoogleIdToken } from "./mobile-google"

const configuredEnv = {
  GOOGLE_WEB_CLIENT_ID: "web-client.apps.googleusercontent.com",
} as NodeJS.ProcessEnv

function tokenInfoResponse(body: unknown, ok = true) {
  return {
    json: async () => body,
    ok,
  }
}

async function expectTRPCError(
  promise: Promise<unknown>,
  expected: {
    code: TRPCError["code"]
    message: string
  },
) {
  try {
    await promise
    throw new Error("Expected verifier to throw.")
  } catch (error) {
    expect(error).toBeInstanceOf(TRPCError)
    expect((error as TRPCError).code).toBe(expected.code)
    expect((error as TRPCError).message).toBe(expected.message)
  }
}

describe("verifyGoogleIdToken", () => {
  test("requires at least one configured Google audience", async () => {
    await expectTRPCError(
      verifyGoogleIdToken({
        env: {},
        fetchTokenInfo: async () => tokenInfoResponse({}),
        idToken: "id-token",
      }),
      {
        code: "PRECONDITION_FAILED",
        message:
          "Google sign-in is not configured yet. Use email code instead.",
      },
    )
  })

  test("fails safely when Google tokeninfo cannot be reached", async () => {
    await expectTRPCError(
      verifyGoogleIdToken({
        env: configuredEnv,
        fetchTokenInfo: async () => {
          throw new Error("network unavailable")
        },
        idToken: "id-token",
      }),
      {
        code: "UNAUTHORIZED",
        message:
          "Google could not verify this sign-in. Use email code instead.",
      },
    )
  })

  test("fails safely when Google tokeninfo rejects the token", async () => {
    await expectTRPCError(
      verifyGoogleIdToken({
        env: configuredEnv,
        fetchTokenInfo: async () => tokenInfoResponse({}, false),
        idToken: "id-token",
      }),
      {
        code: "UNAUTHORIZED",
        message:
          "Google could not verify this sign-in. Use email code instead.",
      },
    )
  })

  test("fails safely when Google tokeninfo returns invalid JSON", async () => {
    await expectTRPCError(
      verifyGoogleIdToken({
        env: configuredEnv,
        fetchTokenInfo: async () => ({
          json: async () => {
            throw new Error("invalid json")
          },
          ok: true,
        }),
        idToken: "id-token",
      }),
      {
        code: "UNAUTHORIZED",
        message:
          "Google could not verify this sign-in. Use email code instead.",
      },
    )
  })

  test("fails safely when Google tokeninfo omits required profile fields", async () => {
    await expectTRPCError(
      verifyGoogleIdToken({
        env: configuredEnv,
        fetchTokenInfo: async () =>
          tokenInfoResponse({
            aud: "web-client.apps.googleusercontent.com",
          }),
        idToken: "id-token",
      }),
      {
        code: "UNAUTHORIZED",
        message:
          "Google could not verify this sign-in. Use email code instead.",
      },
    )
  })

  test("rejects tokens created for another app", async () => {
    await expectTRPCError(
      verifyGoogleIdToken({
        env: configuredEnv,
        fetchTokenInfo: async () =>
          tokenInfoResponse({
            aud: "other-client.apps.googleusercontent.com",
            email: "owner@example.com",
            email_verified: true,
            sub: "google-user-id",
          }),
        idToken: "id-token",
      }),
      {
        code: "UNAUTHORIZED",
        message: "This Google sign-in was created for another app.",
      },
    )
  })

  test("rejects Google accounts without verified email", async () => {
    await expectTRPCError(
      verifyGoogleIdToken({
        env: configuredEnv,
        fetchTokenInfo: async () =>
          tokenInfoResponse({
            aud: "web-client.apps.googleusercontent.com",
            email: "owner@example.com",
            email_verified: "false",
            sub: "google-user-id",
          }),
        idToken: "id-token",
      }),
      {
        code: "UNAUTHORIZED",
        message: "Use a Google account with a verified email address.",
      },
    )
  })

  test("returns the verified profile for an allowed audience", async () => {
    let tokenInfoUrl = ""
    const profile = await verifyGoogleIdToken({
      env: configuredEnv,
      fetchTokenInfo: async (url) => {
        tokenInfoUrl = url

        return tokenInfoResponse({
          aud: "web-client.apps.googleusercontent.com",
          email: "OWNER@EXAMPLE.COM",
          email_verified: "true",
          name: "Store Owner",
          picture: "https://example.com/avatar.png",
          sub: "google-user-id",
        })
      },
      idToken: "id token",
    })

    expect(tokenInfoUrl).toBe(
      "https://oauth2.googleapis.com/tokeninfo?id_token=id%20token",
    )
    expect(profile).toMatchObject({
      aud: "web-client.apps.googleusercontent.com",
      email: "owner@example.com",
      email_verified: "true",
      name: "Store Owner",
      picture: "https://example.com/avatar.png",
      sub: "google-user-id",
    })
  })
})
