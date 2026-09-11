import { auth } from "@ewatrade/auth"
import { storeConversationCustomerAccountAuthInputSchema } from "@ewatrade/service-commerce"
import { type NextRequest, NextResponse } from "next/server"

import { requestIsSameOrigin } from "@/lib/store-conversation-cookie"

export async function POST(request: NextRequest) {
  if (!requestIsSameOrigin(request)) {
    return NextResponse.json(
      { code: "FORBIDDEN", message: "This request is unavailable." },
      { status: 403 },
    )
  }
  const parsed = storeConversationCustomerAccountAuthInputSchema.safeParse(
    await request.json().catch(() => null),
  )
  if (!parsed.success) {
    return NextResponse.json(
      { code: "INVALID_INPUT", message: "Review your account details." },
      { status: 400 },
    )
  }
  const { email, mode, name, password } = parsed.data
  const result = await (mode === "sign_up"
    ? auth.api.signUpEmail({
        body: { email, name: name ?? email, password },
        headers: request.headers,
      })
    : auth.api.signInEmail({
        body: { email, password },
        headers: request.headers,
      })
  ).catch(() => null)
  if (!result?.user?.id) {
    return NextResponse.json(
      {
        code: "ACCOUNT_AUTH_FAILED",
        message:
          mode === "sign_in"
            ? "Email or password is incorrect."
            : "Your account could not be created. Try again.",
      },
      { status: mode === "sign_in" ? 401 : 400 },
    )
  }
  return NextResponse.json({
    account: {
      user: {
        email: result.user.email,
        id: result.user.id,
        name: result.user.name || result.user.email,
      },
    },
  })
}
