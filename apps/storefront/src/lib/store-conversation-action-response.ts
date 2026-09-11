import {
  ServiceCommerceCustomerActionError,
  StoreConversationError,
} from "@ewatrade/db/queries"
import { NextResponse } from "next/server"

export function storeConversationActionErrorResponse(error: unknown) {
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
                : error.code === "STORE_UNAVAILABLE"
                  ? 412
                  : 409,
      },
    )
  }
  if (error instanceof ServiceCommerceCustomerActionError) {
    return NextResponse.json(
      { code: error.code, message: error.message },
      {
        status:
          error.code === "ACTION_FORBIDDEN"
            ? 403
            : error.code === "ACTION_NOT_FOUND" ||
                error.code === "ACTION_EXPIRED"
              ? 404
              : error.code === "ACTION_BLOCKED"
                ? 412
                : 409,
      },
    )
  }
  if (error instanceof Error && error.name === "ZodError") {
    return NextResponse.json(
      {
        code: "INVALID_INPUT",
        message: "This conversation action is invalid.",
      },
      { status: 400 },
    )
  }
  return NextResponse.json(
    {
      code: "UNAVAILABLE",
      message: "This conversation action is unavailable.",
    },
    { status: 503 },
  )
}
