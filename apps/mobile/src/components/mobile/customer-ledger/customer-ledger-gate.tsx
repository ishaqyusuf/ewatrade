import { StatusBanner } from "@/components/mobile/status-banner"
import { useAuthContext } from "@/hooks/use-auth"
import type { ReactNode } from "react"
export function CustomerLedgerGate({
  children,
}: {
  children: (scope: { actorUserId: string; tenantId: string }) => ReactNode
}) {
  const { profile } = useAuthContext()
  if (
    !profile?.businessId ||
    !["OWNER", "ADMIN"].includes(profile.role?.trim().toUpperCase() ?? "")
  )
    return (
      <StatusBanner
        title="Customer finance access"
        message="An owner or administrator can view and manage customer financial records."
        tone="warning"
      />
    )
  return children({ actorUserId: profile.id, tenantId: profile.businessId })
}
