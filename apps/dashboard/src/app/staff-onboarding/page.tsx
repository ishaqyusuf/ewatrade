import { AuthShell } from "@/components/auth/auth-shell"
import { StaffOnboardingForm } from "@/components/auth/staff-onboarding-form"
import { getStaffWebInvitation } from "@/lib/staff-web-invitation"
import { Button } from "@ewatrade/ui"
import {
  currentEffectiveLegalPublication,
  isLegalTestingEnvironment,
} from "@ewatrade/utils/legal-approval"
import { isQaStaffInvitation } from "@ewatrade/utils/staff-invitation-links"
import type { Metadata } from "next"
import Link from "next/link"

export const dynamic = "force-dynamic"
export const metadata: Metadata = {
  title: "Staff invitation | EwaTrade",
  referrer: "no-referrer",
}
export default async function StaffOnboardingPage({
  searchParams,
}: { searchParams: Promise<{ inviteToken?: string }> }) {
  const { inviteToken } = await searchParams
  const invite = await getStaffWebInvitation(inviteToken ?? "").catch(
    () => null,
  )
  if (!invite)
    return (
      <AuthShell
        title="Invitation unavailable"
        description="This link is invalid, expired or already accepted. Ask the business owner for a new invitation."
        asideTitle="Work together."
        asideDescription="Join your business workspace with an invitation from its owner."
      >
        <Button
          variant="outline"
          appearance="form"
          render={<Link href="/login" />}
        >
          Back to sign in
        </Button>
      </AuthShell>
    )
  return (
    <StaffOnboardingForm
      inviteToken={inviteToken ?? ""}
      qaInvitation={isQaStaffInvitation(invite.email, process.env)}
      invite={{
        businessName: invite.tenant.name,
        email: invite.email,
        role: invite.role,
        name: invite.user.name,
        needsAge: invite.user.ageBand === "UNDECLARED",
        needsPassword: invite.needsPassword,
      }}
      legalVersion={
        isLegalTestingEnvironment()
          ? null
          : (currentEffectiveLegalPublication()?.version ?? null)
      }
      marketingUrl={
        process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://ewatrade.com"
      }
    />
  )
}
