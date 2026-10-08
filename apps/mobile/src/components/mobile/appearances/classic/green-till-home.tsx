import type { GreenTillHomeStage } from "@/components/mobile/dashboard/green-till-home-model"
import {
  HeroCard,
  type HeroStat,
} from "@/components/mobile/green-till/hero-card"
import {
  type AttentionItem,
  AttentionRail,
  GhostPreview,
  ListCard,
  NudgeCard,
  QuickActionRow,
  RecordRow,
  SectionHeader,
  type SetupStep,
  SetupSteps,
  StatusPill,
  type StatusPillTone,
} from "@/components/mobile/green-till/kit"
import { StatusBanner } from "@/components/mobile/status-banner"
import type { IconKeys } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import type { GreenTillTint } from "@/lib/green-till-theme"

export type HomeRecentOrder = {
  amount: string
  avatar: { icon?: IconKeys; initials?: string; tint: GreenTillTint }
  customer: string
  id: string
  meta: string
  onPress: () => void
  pill: { icon?: IconKeys; label: string; tone: StatusPillTone }
}

export type HomeSales =
  | { status: "loading" }
  | { status: "unavailable" }
  | {
      status: "ready" | "cached"
      amount: string
      asOf?: string
      delta: { direction: "up" | "down"; value: string } | null
      orderCount: number
      partial: boolean
      stats: HeroStat[]
    }

export type GreenTillOwnerHomeProps = {
  attention: AttentionItem[]
  blocked?: {
    icon: IconKeys
    message: string
    onRetry?: () => void
    title: string
  }
  businessName: string
  canCreateSale: boolean
  isOffline: boolean
  onAddItem: () => void
  onInviteTeam?: () => void
  onNewSale: () => void
  onOrders: () => void
  onPayment: () => void
  onStockIn: () => void
  onSync: () => void
  pendingCommandCount: number
  recentOrders: HomeRecentOrder[]
  recentState: "empty" | "loaded" | "loading" | "unavailable"
  sales: HomeSales
  stage: GreenTillHomeStage
  team?: {
    error: string | null
    onDismiss: () => void
    saving: boolean
  }
}

/** Green Till Home (01) for owners and managers. */
export function GreenTillOwnerHome(props: GreenTillOwnerHomeProps) {
  if (props.stage === "loading") return <HomeSkeleton />
  if (props.stage === "blocked" && props.blocked)
    return (
      <StatusBanner
        actionLabel={props.blocked.onRetry ? "Try again" : undefined}
        icon={props.blocked.icon}
        message={props.blocked.message}
        onActionPress={props.blocked.onRetry}
        title={props.blocked.title}
        tone="warning"
      />
    )
  if (props.stage === "setup" || props.stage === "first-order")
    return <SetupHome {...props} />
  return <EverydayHome {...props} />
}

function EverydayHome(props: GreenTillOwnerHomeProps) {
  const { sales } = props
  const syncPill = props.isOffline
    ? { label: "Offline", tone: "offline" as const }
    : props.pendingCommandCount > 0
      ? { label: `${props.pendingCommandCount} waiting`, tone: "busy" as const }
      : { label: "Synced", tone: "synced" as const }
  return (
    <View>
      {sales.status === "loading" ? (
        <HeroSkeleton />
      ) : sales.status === "unavailable" ? (
        <HeroCard
          label="Today’s sales"
          pill={syncPill}
          sub="Sales are unavailable right now. Pull down to try again."
          title="—"
        />
      ) : (
        <HeroCard
          amount={sales.amount}
          delta={
            sales.status === "ready" ? (sales.delta ?? undefined) : undefined
          }
          label={`Today’s sales${sales.asOf ? ` · as of ${sales.asOf}` : ""}`}
          pill={syncPill}
          stats={sales.stats}
          sub={
            sales.status === "cached"
              ? `Cached figures · ${sales.orderCount} ${sales.orderCount === 1 ? "order" : "orders"}`
              : `${sales.delta ? "vs yesterday · " : ""}${sales.orderCount} ${sales.orderCount === 1 ? "order" : "orders"}${sales.partial ? " (partial)" : ""}`
          }
          testID="home-sales-hero"
        />
      )}

      {props.isOffline || props.pendingCommandCount > 0 ? (
        <StatusBanner
          className="mt-3"
          icon="WifiOff"
          linkLabel="View"
          message={
            props.isOffline
              ? "New sales still work. They upload when you reconnect."
              : "They upload in the background."
          }
          onLinkPress={props.onSync}
          title={`${props.pendingCommandCount} ${props.pendingCommandCount === 1 ? "change" : "changes"} waiting to sync`}
          tone="warning"
        />
      ) : null}

      <QuickActionRow
        actions={[
          {
            disabled: !props.canCreateSale,
            gold: true,
            icon: "Plus",
            label: "New sale",
            onPress: props.onNewSale,
            testID: "home-quick-new-sale",
          },
          { icon: "Package", label: "Add item", onPress: props.onAddItem },
          { icon: "Wallet", label: "Payment", onPress: props.onPayment },
          { icon: "Download", label: "Stock in", onPress: props.onStockIn },
        ]}
      />

      {props.attention.length > 0 && !props.isOffline ? (
        <>
          <SectionHeader
            title="Needs attention"
            trailing={
              <Text className="text-[13px] font-bold text-muted-foreground">
                {props.attention.length}
              </Text>
            }
          />
          <AttentionRail items={props.attention} />
        </>
      ) : null}

      <SectionHeader
        actionLabel="See all"
        onAction={props.onOrders}
        title="Recent orders"
      />
      <RecentOrdersCard orders={props.recentOrders} state={props.recentState} />

      {props.team ? (
        <View>
          <NudgeCard
            actionLabel={props.onInviteTeam ? "Invite" : undefined}
            icon="UserPlus"
            onAction={props.onInviteTeam}
            sub="Optional · let staff record sales"
            testID="home-team-nudge"
            tint="lilac"
            title="Invite your team"
          />
          <Pressable
            accessibilityRole="button"
            className="min-h-11 items-center justify-center"
            disabled={props.team.saving}
            onPress={props.team.onDismiss}
          >
            <Text className="text-[13px] text-muted-foreground">
              {props.team.saving ? "Saving…" : "I work on my own"}
            </Text>
          </Pressable>
          {props.team.error ? (
            <Text className="text-center text-xs text-destructive">
              {props.team.error}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  )
}

function RecentOrdersCard({
  orders,
  state,
}: {
  orders: HomeRecentOrder[]
  state: GreenTillOwnerHomeProps["recentState"]
}) {
  if (state === "loading") return <RowsSkeleton />
  if (state === "unavailable")
    return (
      <StatusBanner
        icon="TriangleAlert"
        message="Recent orders could not load. Pull down to try again."
        tone="warning"
      />
    )
  if (state === "empty" || !orders.length)
    return (
      <StatusBanner
        icon="Receipt"
        message="Orders you record will appear here."
        tone="muted"
      />
    )
  return (
    <ListCard>
      {orders.map((order) => (
        <RecordRow
          accessibilityLabel={`${order.customer}, ${order.meta}, ${order.amount}, ${order.pill.label}`}
          amount={order.amount}
          avatar={order.avatar}
          key={order.id}
          meta={order.meta}
          onPress={order.onPress}
          status={
            <StatusPill
              icon={order.pill.icon}
              label={order.pill.label}
              tone={order.pill.tone}
            />
          }
          title={order.customer}
        />
      ))}
    </ListCard>
  )
}

function SetupHome(props: GreenTillOwnerHomeProps) {
  const first = props.stage === "first-order"
  const steps: SetupStep[] = [
    {
      key: "catalog",
      onPress: first ? undefined : props.onAddItem,
      state: first ? "done" : "now",
      sub: first ? "Ready to sell" : "A product or service with a price",
      title: "Add what you sell",
    },
    {
      key: "order",
      onPress: first && props.canCreateSale ? props.onNewSale : undefined,
      state: first ? "now" : "locked",
      sub: first ? "Takes about a minute" : "Unlocks after your first item",
      title: "Take your first order",
    },
  ]
  if (props.onInviteTeam)
    steps.push({
      icon: "UserPlus",
      key: "team",
      onPress: props.onInviteTeam,
      state: "todo",
      sub: "Optional · do it any time",
      title: "Invite your team",
    })
  return (
    <View>
      <HeroCard
        cta={{
          icon: first ? "Receipt" : "Plus",
          label: first ? "Take your first order" : "Add a product or service",
          onPress: first ? props.onNewSale : props.onAddItem,
          testID: "home-setup-cta",
        }}
        label={`Getting started · ${first ? 1 : 0} of 2`}
        pill={
          props.isOffline
            ? { label: "Offline", tone: "offline" }
            : { label: "Synced", tone: "synced" }
        }
        progress={{ done: first ? 1 : 0, total: 2 }}
        sub={
          first
            ? "Your catalog is set. Record your first sale to start tracking money in."
            : "Two essentials and you can take your first order."
        }
        testID="home-setup-hero"
        title={
          first
            ? "You’re ready for your first customer"
            : `Let’s get ${props.businessName} selling`
        }
      />
      <SetupSteps steps={steps} />
      <GhostPreview message="Today’s sales will appear here after your first order." />
    </View>
  )
}

function HeroSkeleton() {
  return (
    <View
      accessibilityLabel="Loading today’s sales"
      accessible
      className="h-[196px] animate-pulse rounded-[26px] bg-muted"
    />
  )
}

function RowsSkeleton() {
  return (
    <View
      accessibilityLabel="Loading recent orders"
      accessible
      className="gap-3 rounded-[20px] bg-card px-3.5 py-3 shadow-sm"
    >
      {[0, 1, 2].map((row) => (
        <View className="flex-row items-center gap-3" key={row}>
          <View className="size-[38px] animate-pulse rounded-full bg-muted" />
          <View className="flex-1 gap-1.5">
            <View className="h-3.5 w-2/3 animate-pulse rounded bg-muted" />
            <View className="h-3 w-1/2 animate-pulse rounded bg-muted" />
          </View>
        </View>
      ))}
    </View>
  )
}

function HomeSkeleton() {
  return (
    <View className="gap-4">
      <HeroSkeleton />
      <View className="flex-row gap-1.5">
        {[0, 1, 2, 3].map((tile) => (
          <View className="flex-1 items-center" key={tile}>
            <View className="size-[54px] animate-pulse rounded-[18px] bg-muted" />
          </View>
        ))}
      </View>
      <RowsSkeleton />
    </View>
  )
}

export type GreenTillRepHomeProps = {
  canCreateSale: boolean
  isOffline: boolean
  onCloseout: () => void
  onCustomers?: () => void
  onNewSale: () => void
  onSales: () => void
  onStockIn?: () => void
  onSync: () => void
  pendingCommandCount: number
  recentOrders: HomeRecentOrder[]
  recentState: GreenTillOwnerHomeProps["recentState"]
  sales: HomeSales
}

/** Green Till Home (01) for sales reps: their own sales today. */
export function GreenTillRepHome(props: GreenTillRepHomeProps) {
  const { sales } = props
  const pill = props.isOffline
    ? { label: "Offline", tone: "offline" as const }
    : props.pendingCommandCount > 0
      ? { label: `${props.pendingCommandCount} waiting`, tone: "busy" as const }
      : { label: "Synced", tone: "synced" as const }
  const tiles = [
    props.onCustomers
      ? {
          icon: "Users" as const,
          label: "Customers",
          onPress: props.onCustomers,
        }
      : null,
    {
      icon: "ClipboardList" as const,
      label: "Closeout",
      onPress: props.onCloseout,
    },
    props.onStockIn
      ? {
          icon: "Download" as const,
          label: "Stock in",
          onPress: props.onStockIn,
        }
      : null,
    { icon: "RefreshCw" as const, label: "Sync", onPress: props.onSync },
  ].filter((tile) => tile !== null)
  return (
    <View>
      {sales.status === "loading" ? (
        <HeroSkeleton />
      ) : sales.status === "unavailable" ? (
        <HeroCard
          label="Your sales today"
          pill={pill}
          sub="Your sales are unavailable right now. Pull down to try again."
          title="—"
        />
      ) : (
        <HeroCard
          amount={sales.amount}
          cta={
            props.canCreateSale
              ? {
                  icon: "Plus",
                  label: "Start a sale",
                  onPress: props.onNewSale,
                  testID: "rep-start-sale",
                }
              : undefined
          }
          label={`Your sales today${sales.asOf ? ` · as of ${sales.asOf}` : ""}`}
          pill={pill}
          stats={sales.stats}
          sub={`${sales.orderCount} ${sales.orderCount === 1 ? "sale" : "sales"}${props.canCreateSale ? "" : " · no sellable items yet"}`}
          testID="rep-sales-hero"
        />
      )}
      {props.isOffline || props.pendingCommandCount > 0 ? (
        <StatusBanner
          className="mt-3"
          icon="WifiOff"
          linkLabel="View"
          message="New sales still work. They upload when you reconnect."
          onLinkPress={props.onSync}
          title={`${props.pendingCommandCount} ${props.pendingCommandCount === 1 ? "sale" : "sales"} waiting to sync`}
          tone="warning"
        />
      ) : null}
      <QuickActionRow actions={tiles} />
      <NudgeCard
        actionLabel="Start"
        icon="Clock"
        onAction={props.onCloseout}
        sub="Count cash and stock in your custody"
        testID="rep-closeout-nudge"
        tint="amber"
        title="Close out before you leave"
      />
      <SectionHeader
        actionLabel="See all"
        onAction={props.onSales}
        title="Your sales"
      />
      <RecentOrdersCard orders={props.recentOrders} state={props.recentState} />
    </View>
  )
}
