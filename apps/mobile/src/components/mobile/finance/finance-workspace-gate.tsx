import { StatusBanner } from "@/components/mobile/status-banner"
import { Skeleton } from "@/components/ui/skeleton"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { useQuery } from "@tanstack/react-query"
import { useRouter } from "expo-router"
import type { ReactNode } from "react"
import { ActionButton } from "../action-button"
import { HeroCard } from "../green-till/hero-card"

export type FinanceWorkspace = {
  book: NonNullable<RouterOutputs["finance"]["book"]>
  actorUserId: string
  tenantId: string
}

export function FinanceWorkspaceGate({
  children,
  requireOnline = false,
}: {
  children: (workspace: FinanceWorkspace) => ReactNode
  requireOnline?: boolean
}) {
  const offline = useOperationalModeStore((s) => s.isOfflineMode)
  const { profile } = useAuthContext()
  if (requireOnline && offline)
    return (
      <View className="gap-4 px-[18px]">
        <HeroCard
          title="Reconnect to review"
          amount="—"
          sub="Financial balances, history and actions require a fresh online read."
        />
      </View>
    )
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
  const router = useRouter()
  const offline = useOperationalModeStore((s) => s.isOfflineMode)
  const trpc = useTRPC()
  const book = useQuery(
    trpc.finance.book.queryOptions(undefined, {
      retry: false,
      enabled: !offline,
    }),
  )
  if (book.isPending)
    return offline ? (
      <StatusBanner
        title="Reconnect to load Finance"
        message="No saved financial book is available."
        tone="warning"
      />
    ) : (
      <View className="px-[18px]">
        <Skeleton className="h-48 rounded-[22px]" />
      </View>
    )
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
      <View className="gap-4 px-[18px]">
        <HeroCard
          title="Start your financial records"
          sub="Choose your bookkeeping start date in Finance on the dashboard before recording spending."
        />
        <ActionButton variant="outline" onPress={() => router.back()}>
          Go back
        </ActionButton>
      </View>
    )
  return children({ book: book.data, actorUserId, tenantId })
}
