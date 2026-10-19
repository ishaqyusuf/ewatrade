import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import {
  freshShownRead,
  mountOwnedRead,
  nextReadMount,
} from "@ewatrade/assistant/general/staff-activity-target"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useQuery } from "@tanstack/react-query"
import { useRouter } from "expo-router"
import { type ReactNode, useState } from "react"
import { ScrollView } from "react-native"
import { ActionButton } from "../action-button"
import { ListCard } from "../green-till/kit"
import { NativeBookingOriginalScreen } from "./native-booking-original-screen"
import { NativeQuoteOriginalScreen } from "./native-quote-original-screen"
import { NativeServiceJobScreen } from "./native-service-job-screen"
import { NativeServiceMessageScreen } from "./native-service-message-screen"
import { NativeServiceRequestScreen } from "./native-service-request-screen"
import {
  type NativeServiceOriginalTarget,
  nativeServiceOriginalRoute,
  readNativeServiceOriginalTarget,
} from "./native-service-target"

type WorkRecord = RouterOutputs["serviceAssistantWork"]["original"]
type IntakeRecord = RouterOutputs["serviceAssistantIntake"]["receipt"]
type WorkTarget = Exclude<
  Extract<NativeServiceOriginalTarget, { jobId: string }>,
  { kind: "service_job" | "service_manual_message" }
>
type IntakeTarget = Extract<
  NativeServiceOriginalTarget,
  { kind: "service_intake" }
>
const options = {
  retry: false,
  staleTime: 0,
  gcTime: 0,
  refetchOnMount: "always" as const,
  trpc: { abortOnUnmount: true },
}
const human = (value: string | null | undefined) =>
  value ? value.toLowerCase().replaceAll("_", " ") : "Not recorded"
const utc = (value: Date | string | null | undefined) =>
  value && Number.isFinite(new Date(value).getTime())
    ? new Date(value).toISOString()
    : "Not recorded"
const money = (minor: number | null, currency: string) =>
  minor === null
    ? "Not recorded"
    : Number.isSafeInteger(minor)
      ? formatFinanceMoney(String(minor), currency)
      : "Amount unavailable"

/** Exact originals only. A related Order or queue never substitutes for a saved record. */
export function NativeServiceOriginalScreen({ raw }: { raw: unknown }) {
  const target = readNativeServiceOriginalTarget(raw)
  const { profile } = useAuthContext()
  const router = useRouter()
  if (!target)
    return (
      <Notice>
        This Service record link is invalid. Go back and open the saved receipt
        again.
      </Notice>
    )
  if (target.kind === "service_manual_message")
    return <NativeServiceMessageScreen target={target} />
  if (
    target.kind === "service_request" ||
    target.kind === "service_request_page"
  )
    return <NativeServiceRequestScreen target={target} />
  if (target.kind === "commerce_quote_approval")
    return <NativeQuoteOriginalScreen target={target} />
  if (target.kind === "service_booking")
    return <NativeBookingOriginalScreen target={target} />
  if (target.kind === "service_job")
    return (
      <NativeServiceJobScreen
        jobId={target.jobId}
        onBack={() => router.back()}
      />
    )
  if (
    !profile?.id ||
    !profile.businessId ||
    !profile.storeId ||
    (profile.status !== undefined && profile.status !== "ACTIVE") ||
    !(
      profile.role === "OWNER" ||
      profile.role === "ADMIN" ||
      (profile.role === "MANAGER" &&
        (target.kind === "service_intake" ||
          profile.staffAccessMode === "LEGACY"))
    )
  )
    return (
      <Notice>
        Current business and Store service-management access is required for
        this original record.
      </Notice>
    )
  const scope = JSON.stringify([
    profile.id,
    profile.businessId,
    profile.storeId,
    profile.role,
    profile.staffAccessMode,
    profile.catalogEditor,
    profile.status,
    target,
  ])
  return target.kind === "service_intake" ? (
    <IntakeRead key={scope} target={target} />
  ) : (
    <WorkRead key={scope} target={target} storeId={profile.storeId} />
  )
}
function WorkRead({
  target,
  storeId,
}: { target: WorkTarget; storeId: string }) {
  const trpc = useTRPC()
  const [mount] = useState(nextReadMount)
  const query = useQuery(
    mountOwnedRead(
      trpc.serviceAssistantWork.original.queryOptions(target, options),
      mount,
    ),
  )
  const read = freshShownRead(query)
  const r = read.state === "ready" ? read.data : null
  const matches =
    r &&
    r.kind === target.kind &&
    r.jobId === target.jobId &&
    r.original.jobId === target.jobId &&
    r.currentJob.jobId === target.jobId &&
    r.currentJob.storeId === storeId &&
    (target.kind === "service_work"
      ? r.kind === "service_work" && r.original.eventId === target.eventId
      : r.kind !== "service_work" && r.original.recordId === target.recordId)
  if (read.state === "checking")
    return <Notice>Checking current access to the exact Service record…</Notice>
  if (!r || !matches) return <Unavailable retry={() => void query.refetch()} />
  return (
    <ScrollView
      contentContainerStyle={{ gap: 16, padding: 18, paddingBottom: 36 }}
    >
      <WorkContent record={r} />
      <ActionButton variant="outline" onPress={() => void query.refetch()}>
        Refresh original
      </ActionButton>
    </ScrollView>
  )
}
function WorkContent({ record: r }: { record: WorkRecord }) {
  const router = useRouter()
  return (
    <>
      <Section
        title={
          r.kind === "service_work"
            ? "Original work event"
            : r.kind === "service_work_note"
              ? "Original internal note"
              : "Original exception occurrence"
        }
      >
        <Fact
          name="Record reference"
          value={
            r.kind === "service_work" ? r.original.eventId : r.original.recordId
          }
        />
        <Fact name="Job reference" value={r.original.jobId} />
        <Fact
          name="Line reference"
          value={r.original.lineId ?? "Job-level record"}
        />
        <Fact
          name="Recorded actor reference"
          value={r.original.actorUserId ?? "Not recorded"}
        />
        <Fact name="Recorded (UTC)" value={utc(r.original.createdAt)} />
        {r.kind === "service_work" ? (
          <>
            <Fact name="Original event" value={human(r.original.type)} />
            <Fact name="Original source" value={human(r.original.source)} />
            <Fact name="Effective (UTC)" value={utc(r.original.effectiveAt)} />
            <Fact name="Before" value={human(r.original.beforeStatus)} />
            <Fact name="After" value={human(r.original.afterStatus)} />
            <Fact
              name="Original reason"
              value={r.original.reason ?? "Not recorded"}
            />
            {"assignment" in r.original.details &&
            r.original.details.assignment ? (
              <Fact
                name="Recorded assignee reference"
                value={r.original.details.assignment.assigneeUserId}
              />
            ) : null}
            {"promise" in r.original.details && r.original.details.promise ? (
              <>
                <Fact
                  name="Previous promise (UTC)"
                  value={utc(r.original.details.promise.previousPromisedAt)}
                />
                <Fact
                  name="Recorded promise (UTC)"
                  value={utc(r.original.details.promise.promisedAt)}
                />
              </>
            ) : null}
            {"rework" in r.original.details && r.original.details.rework ? (
              <>
                <Fact
                  name="Completed source Line reference"
                  value={r.original.details.rework.sourceLineId}
                />
                <Fact
                  name="Original rework quantity"
                  value={r.original.details.rework.quantity}
                />
              </>
            ) : null}
            {"handoff" in r.original.details && r.original.details.handoff ? (
              <Fact
                name="Payment state recorded at handoff"
                value={human(r.original.details.handoff.paymentStatus)}
              />
            ) : null}
            {r.original.details.coverage !== "recorded" ? (
              <Text className="text-xs text-muted-foreground">
                {r.original.details.coverage === "unavailable"
                  ? "Original event details are unavailable."
                  : "No additional original details are shown for this event type."}
              </Text>
            ) : null}
          </>
        ) : r.kind === "service_work_note" ? (
          <Fact name="Original internal note" value={r.original.body} />
        ) : (
          <>
            <Fact name="Exception type" value={human(r.original.type)} />
            <Fact name="Occurred (UTC)" value={utc(r.original.occurredAt)} />
            <Fact name="Original description" value={r.original.description} />
            <Text className="text-xs text-muted-foreground">
              The creation outcome was not saved as an immutable snapshot.
              Current resolution does not establish the original outcome.
            </Text>
          </>
        )}
        <Text className="text-xs text-muted-foreground">
          User references are recorded IDs. Historical display names are
          unavailable. Stored times are shown in UTC.
        </Text>
      </Section>
      {r.kind === "service_work_exception" ? (
        <Section title="Current exception resolution">
          <Fact
            name="Current outcome"
            value={human(r.currentException.outcome)}
          />
          <Fact
            name="Resolved (UTC)"
            value={utc(r.currentException.resolvedAt)}
          />
          <Fact
            name="Current resolver reference"
            value={r.currentException.resolvedByUserId ?? "Not recorded"}
          />
          <Fact
            name="Last updated (UTC)"
            value={utc(r.currentException.updatedAt)}
          />
        </Section>
      ) : null}
      <Section title="Current Job and line">
        <Fact
          name="Current Job revision"
          value={String(r.currentJob.revision)}
        />
        <Fact
          name="Current assignee reference"
          value={r.currentJob.currentAssigneeUserId ?? "Unassigned"}
        />
        <Fact name="Completed (UTC)" value={utc(r.currentJob.completedAt)} />
        <Fact name="Cancelled (UTC)" value={utc(r.currentJob.cancelledAt)} />
        <Fact name="Handed off (UTC)" value={utc(r.currentJob.handedOffAt)} />
        {r.currentLine ? (
          <>
            <Fact
              name="Current line status"
              value={human(r.currentLine.status)}
            />
            <Fact
              name="Current line revision"
              value={String(r.currentLine.revision)}
            />
          </>
        ) : null}
        <Fact name="Checked (UTC)" value={utc(r.asOf)} />
        <Text className="text-xs text-muted-foreground">
          These current Job and line facts can change after the original event.
          Current payment and balance belong to the Order.
        </Text>
        <ActionButton
          variant="outline"
          onPress={() => {
            const route = nativeServiceOriginalRoute({
              kind: "service_job",
              jobId: r.currentJob.jobId,
            })
            if (route) router.push(route)
          }}
        >
          Open current Job
        </ActionButton>
        <ActionButton
          variant="outline"
          onPress={() =>
            router.push({
              pathname: "/order/[orderId]",
              params: { orderId: r.currentJob.orderId },
            })
          }
        >
          Open current Order
        </ActionButton>
      </Section>
    </>
  )
}
function IntakeRead({ target }: { target: IntakeTarget }) {
  const trpc = useTRPC()
  const [mount] = useState(nextReadMount)
  const query = useQuery(
    mountOwnedRead(
      trpc.serviceAssistantIntake.receipt.queryOptions(
        { intakeId: target.intakeId },
        options,
      ),
      mount,
    ),
  )
  const read = freshShownRead(query)
  if (read.state === "checking")
    return <Notice>Checking current access to the exact Service intake…</Notice>
  if (
    read.state === "refused" ||
    read.data.intakeId !== target.intakeId ||
    read.data.orderId !== target.orderId
  )
    return <Unavailable retry={() => void query.refetch()} />
  return <IntakeContent record={read.data} retry={() => void query.refetch()} />
}
function IntakeContent({
  record: r,
  retry,
}: { record: IntakeRecord; retry: () => void }) {
  const router = useRouter()
  return (
    <ScrollView
      contentContainerStyle={{ gap: 16, padding: 18, paddingBottom: 36 }}
    >
      <Section title={`${r.orderNumber} · Confirmed intake`}>
        <Fact name="Intake reference" value={r.intakeId} />
        <Fact
          name="Saved customer contact"
          value={[
            r.customer.name ?? "Walk-in contact",
            r.customer.phone,
            r.customer.email,
          ]
            .filter(Boolean)
            .join(" · ")}
        />
        <Fact name="Confirmed (UTC)" value={utc(r.confirmedAt)} />
        <Fact
          name="Recorded actor reference"
          value={r.createdByUserId ?? "Not recorded"}
        />
        {r.lines.map((line) => (
          <View
            key={line.orderLineId}
            className="gap-2 border-t border-border pt-3"
          >
            <Text className="font-bold text-foreground">
              {[line.itemName, line.variantName, line.offeringName]
                .filter(Boolean)
                .join(" · ")}
            </Text>
            <Text>
              {line.quantity} × {money(line.unitPriceMinor, r.currencyCode)} ·{" "}
              {money(line.totalMinor, r.currencyCode)}
            </Text>
            <Text>
              {line.workPolicy === "TRACKED"
                ? "Tracked Job Line"
                : "Charge-only Order line"}{" "}
              · {human(line.authorizationPolicy)}
            </Text>
          </View>
        ))}
        <Fact
          name="Original subtotal"
          value={money(r.subtotalMinor, r.currencyCode)}
        />
        <Fact
          name="Original service charge"
          value={money(r.serviceChargeMinor, r.currencyCode)}
        />
        <Fact
          name="Original total"
          value={money(r.totalMinor, r.currencyCode)}
        />
        <Fact
          name="Initial recorded payment"
          value={money(r.initialPaymentMinor, r.currencyCode)}
        />
        <Fact
          name="Balance at intake"
          value={money(r.initialBalanceMinor, r.currencyCode)}
        />
        {r.initialPayment ? (
          <>
            <Fact
              name="Linked initial payment"
              value={`${money(r.initialPayment.amountMinor, r.currencyCode)} · ${human(r.initialPayment.method)}${r.initialPayment.reference ? ` · ${r.initialPayment.reference}` : ""}`}
            />
            <Fact
              name="Payment recorded (UTC)"
              value={utc(r.initialPayment.recordedAt)}
            />
          </>
        ) : r.initialPaymentMinor > 0 ? (
          <Text>
            Matching initial payment record is unavailable; the original
            recorded amount remains separate.
          </Text>
        ) : null}
        <Fact name="Requested (UTC)" value={utc(r.requestedAt)} />
        <Fact name="Original promise (UTC)" value={utc(r.promisedAt)} />
        <Fact name="Original priority" value={human(r.priority)} />
        <Fact name="Original service level" value={human(r.serviceLevel)} />
        <Fact
          name="Original assignee reference"
          value={r.assigneeUserId ?? "Not recorded"}
        />
        <Fact
          name="Saved instructions"
          value={r.instructions ?? "Not recorded"}
        />
        <Fact
          name="Saved condition"
          value={r.conditionNote ?? "Not recorded"}
        />
        <Text className="text-xs text-muted-foreground">
          These are saved intake facts. Current payment and balance belong to
          the Order; current work status is shown separately below. No provider
          charge or notification is made by opening this receipt.
        </Text>
        <ActionButton
          variant="outline"
          onPress={() =>
            router.push({
              pathname: "/order/[orderId]",
              params: { orderId: r.orderId },
            })
          }
        >
          Open current Order
        </ActionButton>
      </Section>
      <Section title="Current tracked work">
        {r.jobs.length ? (
          r.jobs.map((job, index) => (
            <View key={job.id} className="gap-2">
              <Text className="font-bold text-foreground">
                Job {index + 1} · {job.id}
              </Text>
              {job.lines.map((line) => (
                <Text key={line.id}>
                  {line.allocatedQuantity} · {human(line.status)} ·{" "}
                  {human(line.authorizationStatus)}
                </Text>
              ))}
              <ActionButton
                variant="outline"
                onPress={() => {
                  const route = nativeServiceOriginalRoute({
                    kind: "service_job",
                    jobId: job.id,
                  })
                  if (route) router.push(route)
                }}
              >
                Open current Job
              </ActionButton>
            </View>
          ))
        ) : (
          <Text>
            {r.lines.some((line) => line.workPolicy === "TRACKED")
              ? "Current tracked Job records are unavailable."
              : "Original lines are charge-only; no tracked Job is shown."}
          </Text>
        )}
        <Text className="text-xs text-muted-foreground">
          Current Job status and authorization do not replace the original
          intake facts. Ready does not mean paid or collected.
        </Text>
      </Section>
      <ActionButton variant="outline" onPress={retry}>
        Refresh original
      </ActionButton>
    </ScrollView>
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
function Fact({ name, value }: { name: string; value: string }) {
  return (
    <View className="gap-1">
      <Text className="text-xs text-muted-foreground">{name}</Text>
      <Text className="text-sm text-foreground">{value}</Text>
    </View>
  )
}
function Notice({ children }: { children: ReactNode }) {
  return (
    <View className="p-5">
      <Text className="text-sm text-muted-foreground">{children}</Text>
    </View>
  )
}
function Unavailable({ retry }: { retry: () => void }) {
  return (
    <View className="gap-3 p-5">
      <Text accessibilityRole="alert">
        This exact Service record is unavailable for your current business,
        Store or access.
      </Text>
      <ActionButton variant="outline" onPress={retry}>
        Retry original
      </ActionButton>
    </View>
  )
}
