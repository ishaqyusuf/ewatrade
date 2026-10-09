import { earlyAccessHeaders } from "@/lib/early-access-response"
import { getDashboardSignupUrl } from "@ewatrade/onboarding/lib/signup-navigation"
import { NextResponse } from "next/server"

// Early access was retired for direct signup on 7 October 2026. Older app
// builds and cached pages still post here, so answer with where to go now.
// Previously issued approval and setup links keep working through the
// approve, verification, verify and session routes.
export async function POST() {
  return NextResponse.json(
    {
      message: "Early access has ended. Create your store directly instead.",
      signupUrl: getDashboardSignupUrl(),
    },
    { status: 410, headers: earlyAccessHeaders },
  )
}
