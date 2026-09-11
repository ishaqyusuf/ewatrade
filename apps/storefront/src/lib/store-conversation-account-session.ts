import "server-only"

import { auth } from "@ewatrade/auth"
import { StoreConversationError } from "@ewatrade/db/queries"
import { NextResponse } from "next/server"

export async function getStorefrontCustomerAccount(headers: Headers) {
  const session = await auth.api.getSession({ headers })
  return session?.user?.id
    ? {
        user: {
          email: session.user.email,
          id: session.user.id,
          name: session.user.name || session.user.email,
        },
      }
    : null
}

export async function requireStorefrontCustomerAccount(headers: Headers) {
  const account = await getStorefrontCustomerAccount(headers)
  if (!account) {
    throw new StoreConversationError(
      "FORBIDDEN",
      "Sign in to your Customer Account to continue.",
    )
  }
  return account
}

export function storeConversationAccountErrorResponse(error: unknown) {
  if (error instanceof StoreConversationError) {
    return NextResponse.json(
      { code: error.code, message: error.message },
      {
        status:
          error.code === "FORBIDDEN" ||
          error.code === "GUEST_CREDENTIAL_EXPIRED"
            ? 401
            : error.code === "NOT_FOUND"
              ? 404
              : 409,
      },
    )
  }
  if (error instanceof Error && error.name === "ZodError") {
    return NextResponse.json(
      { code: "INVALID_INPUT", message: "Review the account details." },
      { status: 400 },
    )
  }
  return NextResponse.json(
    { code: "UNAVAILABLE", message: "Customer Account access is unavailable." },
    { status: 503 },
  )
}
