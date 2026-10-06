import { onboardingAppAssociations } from "@/lib/onboarding-app-association"

export const dynamic = "force-dynamic"

export function GET() {
  const association = onboardingAppAssociations(process.env).android
  return association
    ? Response.json(association, {
        headers: { "Cache-Control": "public, max-age=300" },
      })
    : Response.json({ error: "Association unavailable" }, { status: 503 })
}
