import { StatusBanner } from "@/components/mobile/status-banner"
import { Text } from "@/components/ui/text"
import { useAuthContext } from "@/hooks/use-auth"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { useQuery } from "@tanstack/react-query"
import type { ReactNode } from "react"

export type FinanceWorkspace = {
  book: NonNullable<RouterOutputs["finance"]["book"]>
  actorUserId: string
  tenantId: string
}

export function FinanceWorkspaceGate({
  children,
}: { children: (workspace: FinanceWorkspace) => ReactNode }) {
  const { profile } = useAuthContext()
  if (
    !profile?.businessId ||
    !["OWNER", "ADMIN"].includes(profile.role?.trim().toUpperCase() ?? "")
  )
    return (
      <StatusBanner
        title="Finance access"
        message="An owner or administrator can manage financial records."
        tone="warning"
      />
    )
  return (
    <AuthorizedBook
      key={`${profile.id}:${profile.businessId}`}
      actorUserId={profile.id}
      tenantId={profile.businessId}
    >
      {children}
    </AuthorizedBook>
  )
}

function AuthorizedBook({
  actorUserId,
  tenantId,
  children,
}: Omit<FinanceWorkspace, "book"> & {
  children: (workspace: FinanceWorkspace) => ReactNode
}) {
  const trpc = useTRPC()
  const book = useQuery(
    trpc.finance.book.queryOptions(undefined, { retry: false }),
  )
  if (book.isPending)
    return <Text className="px-4">Loading financial book…</Text>
  if (book.isError)
    return (
      <StatusBanner
        title="Finance unavailable"
        message={book.error.message}
        actionLabel="Try again"
        onActionPress={() => void book.refetch()}
        tone="destructive"
      />
    )
  if (!book.data)
    return (
      <StatusBanner
        title="Start your financial records"
        message="Choose your bookkeeping start date in Finance on the dashboard before recording spending."
      />
    )
  return children({ book: book.data, actorUserId, tenantId })
}
