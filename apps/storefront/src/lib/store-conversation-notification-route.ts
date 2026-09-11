import {
  StoreConversationError,
  StoreConversationNotificationError,
} from "@ewatrade/db/queries"
import { NextResponse } from "next/server"

export function storeConversationNotificationErrorResponse(
  error: unknown,
  fallback: string,
) {
  if (error instanceof StoreConversationNotificationError) {
    return NextResponse.json(
      { code: error.code, message: error.message },
      {
        status:
          error.code === "RATE_LIMITED"
            ? 429
            : error.code === "FORBIDDEN"
              ? 403
              : error.code === "NOT_FOUND"
                ? 404
                : 409,
      },
    )
  }
  if (error instanceof StoreConversationError) {
    return NextResponse.json(
      { code: error.code, message: error.message },
      {
        status:
          error.code === "GUEST_CREDENTIAL_EXPIRED"
            ? 401
            : error.code === "FORBIDDEN"
              ? 403
              : error.code === "NOT_FOUND"
                ? 404
                : 409,
      },
    )
  }
  if (error instanceof Error && error.name === "ZodError") {
    return NextResponse.json(
      { code: "INVALID_INPUT", message: "Notification details are invalid." },
      { status: 400 },
    )
  }
  return NextResponse.json(
    { code: "UNAVAILABLE", message: fallback },
    { status: 503 },
  )
}
