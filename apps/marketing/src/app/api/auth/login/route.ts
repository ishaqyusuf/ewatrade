import { getDashboardLoginUrl } from "@/lib/auth-navigation"
import { NextResponse } from "next/server"

export async function POST() {
  return NextResponse.json(
    { error: "Sign in from the dashboard.", loginUrl: getDashboardLoginUrl() },
    { status: 410 },
  )
}
