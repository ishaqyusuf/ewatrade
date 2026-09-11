import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

import { getStorefrontCustomerAccount } from "@/lib/store-conversation-account-session"

export async function GET(request: NextRequest) {
  const account = await getStorefrontCustomerAccount(request.headers)
  return NextResponse.json({ account })
}
