import { getDashboardSignupUrl } from "@ewatrade/onboarding/lib/signup-navigation"
import { NextResponse } from "next/server"

// The waitlist was retired for direct signup on 7 October 2026.
export async function POST() {
  return NextResponse.json(
    {
      message: "The waitlist has closed. Create your store directly instead.",
      signupUrl: getDashboardSignupUrl(),
    },
    { status: 410, headers: { "Cache-Control": "no-store" } },
  )
}
