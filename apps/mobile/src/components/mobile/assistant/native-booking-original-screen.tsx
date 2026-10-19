import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import {
  type ServiceBookingTarget,
  serviceBookingTargetSchema,
} from "@ewatrade/assistant/general/booking-read"
import {
  freshShownRead,
  mountOwnedRead,
  nextReadMount,
} from "@ewatrade/assistant/general/staff-activity-target"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useQuery } from "@tanstack/react-query"
import { useRouter } from "expo-router"
import { type ReactNode, useEffect, useRef, useState } from "react"
import { ScrollView } from "react-native"
import { ActionButton } from "../action-button"
import { ListCard } from "../green-till/kit"

type Booking = RouterOutputs["serviceCommerce"]["assistantBookingDetail"]
type Scope = { actorUserId: string; tenantId: string; storeId: string }
const options = {
  retry: false,
  staleTime: 0,
  gcTime: 0,
  refetchOnMount: "always" as const,
  trpc: { abortOnUnmount: true },
}
const label = (value: string | null | undefined) =>
  value ? value.replaceAll("_", " ") : "Not recorded"
const utc = (value: string | null) =>
  value === null
    ? "Not recorded"
    : Number.isFinite(Date.parse(value))
      ? new Date(value).toISOString()
      : "Time unavailable"
const integer = (value: number) =>
  Number.isSafeInteger(value) && value >= 0 ? String(value) : "Unavailable"
function money(value: number | null, currency: string) {
  if (value === null) return "Amount unavailable (not recorded)"
  if (!Number.isSafeInteger(value) || value < 0) return "Amount unavailable"
  try {
    return formatFinanceMoney(String(value), currency)
  } catch {
    return "Amount unavailable"
  }
}
/** Exact saved tuple. Protected pure reads never reconcile or mutate bookings. */
export function NativeBookingOriginalScreen({
  target: raw,
}: { target: ServiceBookingTarget }) {
  const { profile } = useAuthContext()
  const key = JSON.stringify([
    profile?.id,
    profile?.businessId,
    profile?.storeId,
    profile?.role,
    profile?.staffAccessMode,
    profile?.catalogEditor,
    profile?.status,
    raw,
  ])
  const current = useRef(key)
  const mounted = useRef(true)
  current.current = key
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const parsed = serviceBookingTargetSchema.safeParse(raw)
  if (
    !parsed.success ||
    !profile?.id ||
    !profile.businessId ||
    !profile.storeId ||
    (profile.status !== undefined && profile.status !== "ACTIVE")
  )
    return (
      <Notice>
        This original booking link or your current business and Store access is
        unavailable.
      </Notice>
    )
  return (
    <BookingRead
      key={key}
      target={parsed.data}
      scope={{
        actorUserId: profile.id,
        tenantId: profile.businessId,
        storeId: profile.storeId,
      }}
      isCurrent={() => mounted.current && current.current === key}
    />
  )
}
function BookingRead({
  target,
  scope,
  isCurrent,
}: { target: ServiceBookingTarget; scope: Scope; isCurrent: () => boolean }) {
  const trpc = useTRPC()
  const [mount] = useState(nextReadMount)
  const context = useQuery(
    mountOwnedRead(trpc.tenant.current.queryOptions(undefined, options), mount),
  )
  const current = freshShownRead(context)
  const scopeMatches = (data: {
    actorUserId: string
    tenant: { id: string }
    activeStore: { id: string } | null
  }) =>
    data?.actorUserId === scope.actorUserId &&
    data?.tenant?.id === scope.tenantId &&
    data?.activeStore?.id === scope.storeId
  const scopeReady = current.state === "ready" && scopeMatches(current.data)
  const query = useQuery(
    mountOwnedRead(
      trpc.serviceCommerce.assistantBookingDetail.queryOptions(
        {
          bookingId: target.bookingId,
          sourceId: target.sourceId,
          offeringId: target.offeringId,
        },
        { ...options, enabled: scopeReady },
      ),
      mount,
    ),
  )
  const fresh = freshShownRead(query)
  const booking =
    scopeReady &&
    fresh.state === "ready" &&
    fresh.data.id === target.bookingId &&
    fresh.data.sourceId === target.sourceId &&
    fresh.data.offeringId === target.offeringId
      ? fresh.data
      : null
  const refused =
    current.state === "refused" ||
    (current.state === "ready" && !scopeReady) ||
    (scopeReady &&
      (fresh.state === "refused" || (fresh.state === "ready" && !booking)))
  async function refresh() {
    const read = await context.refetch()
    if (isCurrent() && read.isSuccess && scopeMatches(read.data))
      await query.refetch()
  }
  if (!booking)
    return (
      <View className="gap-3 p-5">
        <Text accessibilityRole={refused ? "alert" : undefined}>
          {refused
            ? "This exact saved booking is unavailable for the current business, Store, source or access."
            : "Checking current access to the exact saved booking…"}
        </Text>
        {refused ? (
          <ActionButton variant="outline" onPress={() => void refresh()}>
            Retry original booking
          </ActionButton>
        ) : null}
      </View>
    )
  return (
    <ScrollView
      contentContainerStyle={{ gap: 16, padding: 18, paddingBottom: 36 }}
    >
      <BookingContent booking={booking} />
      <ActionButton variant="outline" onPress={() => void refresh()}>
        Refresh original booking
      </ActionButton>
    </ScrollView>
  )
}
function BookingContent({ booking: b }: { booking: Booking }) {
  const router = useRouter()
  const order =
    b.payment.currentOrder && b.payment.currentOrder.id === b.commercialOrderId
      ? b.payment.currentOrder
      : null
  return (
    <>
      <Section title="Saved booking">
        <Fact title="Stored booking status" value={label(b.status)} />
        <Fact title="Saved revision" value={integer(b.revision)} />
        <Fact title="Start (UTC)" value={utc(b.startAt)} />
        <Fact title="End (UTC)" value={utc(b.endAt)} />
        <Fact title="Saved timezone" value={b.timezone} />
        <Fact title="Reserved capacity" value={integer(b.reservedCapacity)} />
        <Text>
          These are the saved time and reserved capacity for this original
          booking. Remaining capacity was not checked.
        </Text>
      </Section>
      <Section title="Saved payment policy">
        <Fact
          title="Stored booking payment status"
          value={label(b.payment.storedStatus)}
        />
        <Fact
          title="Saved payment requirement"
          value={label(b.payment.requirement)}
        />
        <Fact
          title="Saved payable amount"
          value={money(b.payment.payableMinor, b.payment.currencyCode)}
        />
        <Fact
          title="Saved required amount"
          value={money(b.payment.requiredMinor, b.payment.currencyCode)}
        />
        <Fact
          title="Saved deposit"
          value={money(b.payment.depositMinor, b.payment.currencyCode)}
        />
        <Fact
          title="Saved payment policy revision"
          value={integer(b.payment.policyRevision)}
        />
        <Text>
          The stored booking payment status and policy amounts are separate from
          current Order facts. Provider settlement was not checked.
        </Text>
      </Section>
      <Section title="Current original Order">
        {order ? (
          <>
            <Fact title="Order" value={order.orderNumber} />
            <Fact title="Current Order status" value={label(order.status)} />
            <Fact
              title="Stored Order payment status"
              value={label(order.storedPaymentStatus)}
            />
            <Fact
              title="Current Order total"
              value={money(order.totalMinor, order.currencyCode)}
            />
            <Fact
              title="Recorded amount paid"
              value={money(order.recordedAmountPaidMinor, order.currencyCode)}
            />
            <ActionButton
              variant="outline"
              onPress={() =>
                router.push({
                  pathname: "/order/[orderId]",
                  params: { orderId: order.id },
                })
              }
            >
              Open current Order
            </ActionButton>
          </>
        ) : (
          <Text>
            {b.payment.currentOrder || b.commercialOrderId
              ? "The current linked Order is unavailable. No current balance or paid outcome is inferred."
              : "No current Order is linked to this booking. This does not establish a zero balance or paid outcome."}
          </Text>
        )}
      </Section>
      <Section title="Current resource and configuration">
        <Fact title="Current resource label" value={b.resource.label} />
        <Fact title="Resource kind" value={label(b.resource.kind)} />
        <Fact
          title="Current resource status"
          value={label(b.resource.status)}
        />
        <Fact
          title="Current configured resource capacity"
          value={integer(b.resource.currentCapacity)}
        />
        <Fact
          title="Current resource revision"
          value={integer(b.resource.currentRevision)}
        />
        <Fact
          title="Configuration revision at booking"
          value={integer(b.configuration.bookedRevision)}
        />
        <Fact
          title="Current configuration revision"
          value={integer(b.configuration.currentRevision)}
        />
        <Fact
          title="Current configuration status"
          value={label(b.configuration.currentStatus)}
        />
        <Text>
          Current resource capacity is a configured total, not a count of
          available slots. Current configuration does not replace the saved
          booking revision or reserved capacity.
        </Text>
      </Section>
      <Section title="Saved cancellation terms">
        <Fact
          title="Window before start (minutes)"
          value={integer(b.cancellationPolicy.windowMinutesBeforeStart)}
        />
        <Fact
          title="Saved refund policy"
          value={label(b.cancellationPolicy.refundPolicy)}
        />
        <Fact
          title="Saved cancellation policy revision"
          value={integer(b.cancellationPolicy.revision)}
        />
        <Text>
          These saved terms are not a current cancellation or refund decision
          and do not establish current refund eligibility.
        </Text>
      </Section>
      <Section title="Recorded milestones (UTC)">
        {(
          [
            ["Confirmed", b.milestones.confirmedAt],
            ["Arrived", b.milestones.arrivedAt],
            ["Started", b.milestones.startedAt],
            ["Completed", b.milestones.completedAt],
            ["Cancelled", b.milestones.cancelledAt],
            ["No-show recorded", b.milestones.noShowAt],
          ] as const
        ).map(([title, value]) => (
          <Fact key={title} title={title} value={utc(value)} />
        ))}
      </Section>
      <Text className="text-xs text-muted-foreground">
        This view reads saved booking and current configuration facts under
        current access. It changes no booking, payment, refund, Order or public
        capability. Clinical and other protected policy restrictions remain
        authoritative.
      </Text>
    </>
  )
}
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <ListCard>
      <View className="gap-3 py-3">
        <Text
          accessibilityRole="header"
          className="text-lg font-bold text-foreground"
        >
          {title}
        </Text>
        {children}
      </View>
    </ListCard>
  )
}
function Fact({ title, value }: { title: string; value: string }) {
  return (
    <View className="gap-1">
      <Text className="text-xs text-muted-foreground">{title}</Text>
      <Text className="text-sm text-foreground">{value}</Text>
    </View>
  )
}
function Notice({ children }: { children: ReactNode }) {
  return (
    <View className="p-5">
      <Text accessibilityRole="alert">{children}</Text>
    </View>
  )
}
