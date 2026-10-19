import { StatusBanner } from "@/components/mobile/status-banner"
import { Skeleton } from "@/components/ui/skeleton"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import {
  freshShownRead,
  mountOwnedRead,
  nextReadMount,
} from "@ewatrade/assistant/general/staff-activity-target"
import { useQuery } from "@tanstack/react-query"
import { useRouter } from "expo-router"
import { type ReactNode, useState } from "react"
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
  expectedBookId,
}: {
  children: (workspace: FinanceWorkspace) => ReactNode
  requireOnline?: boolean
  expectedBookId?: string
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
    (expectedBookId !== undefined && !profile.id) ||
    (expectedBookId !== undefined &&
      profile.status !== undefined &&
      profile.status !== "ACTIVE") ||
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
      key={
        expectedBookId === undefined
          ? `${profile.id}:${profile.businessId}:current`
          : JSON.stringify([
              profile.id,
              profile.businessId,
              profile.storeId,
              profile.status,
              profile.role,
              profile.staffAccessMode,
              profile.catalogEditor,
              expectedBookId,
            ])
      }
      actorUserId={profile.id}
      tenantId={profile.businessId}
      expectedBookId={expectedBookId}
    >
      {children}
    </AuthorizedBook>
  )
}

function AuthorizedBook({
  actorUserId,
  tenantId,
  children,
  expectedBookId,
}: Omit<FinanceWorkspace, "book"> & {
  children: (workspace: FinanceWorkspace) => ReactNode
  expectedBookId?: string
}) {
  const router = useRouter()
  const offline = useOperationalModeStore((s) => s.isOfflineMode)
  const trpc = useTRPC()
  const [mount] = useState(nextReadMount)
  const options = trpc.finance.book.queryOptions(undefined, {
    retry: false,
    enabled: !offline,
    ...(expectedBookId === undefined
      ? {}
      : {
          staleTime: 0,
          gcTime: 0,
          refetchOnMount: "always" as const,
          trpc: { abortOnUnmount: true },
        }),
  })
  const book = useQuery(
    expectedBookId === undefined ? options : mountOwnedRead(options, mount),
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
  if (expectedBookId !== undefined && freshShownRead(book).state !== "ready")
    return (
      <StatusBanner
        title="Checking the receipt’s Book"
        message="Wait for a fresh authorized read before viewing this original record."
      />
    )
  if (expectedBookId !== undefined && book.data?.id !== expectedBookId)
    return (
      <StatusBanner
        title="Receipt Book unavailable"
        message="This receipt belongs to another Finance Book. Open the original from the dashboard."
        tone="warning"
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
