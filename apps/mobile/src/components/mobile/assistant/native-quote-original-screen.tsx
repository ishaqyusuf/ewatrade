import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import type { GeneralAnswer } from "@ewatrade/assistant/general/contracts"
import { quoteApprovalTargetSchema } from "@ewatrade/assistant/general/quote-reads"
import {
  freshShownRead,
  mountOwnedRead,
  nextReadMount,
} from "@ewatrade/assistant/general/staff-activity-target"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useQuery } from "@tanstack/react-query"
import { type ReactNode, useEffect, useState } from "react"
import { ScrollView } from "react-native"
import { ActionButton } from "../action-button"
import { ListCard } from "../green-till/kit"
import {
  type NativeQuoteScope,
  createNativeQuoteScopeFence,
  nativeQuoteScopeMatches,
} from "./native-quote-decision-values"

type Target = Extract<
  NonNullable<GeneralAnswer["target"]>,
  { kind: "commerce_quote_approval" }
>
type Detail = RouterOutputs["serviceCommerce"]["assistantQuoteApprovalDetail"]
const options = {
  retry: false,
  staleTime: 0,
  gcTime: 0,
  refetchOnMount: "always" as const,
  trpc: { abortOnUnmount: true },
}
const human = (value: string) => value.replaceAll("_", " ")
const utc = (value: Date | string | null) =>
  value && Number.isFinite(new Date(value).getTime())
    ? new Date(value).toISOString()
    : "Not recorded"
const money = (value: number | null, currency: string) =>
  value === null
    ? "Not recorded"
    : !Number.isSafeInteger(value)
      ? "Unavailable amount"
      : formatFinanceMoney(String(value), currency)
/** Original tuple and stored outcome only; no reconciling native detail or decision command. */
export function NativeQuoteOriginalScreen({ target: raw }: { target: Target }) {
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
  const [fence] = useState(createNativeQuoteScopeFence)
  fence.update(key)
  useEffect(() => {
    fence.activate()
    return () => fence.dispose()
  }, [fence])
  const parsed = quoteApprovalTargetSchema.safeParse(raw)
  if (
    !parsed.success ||
    !profile?.id ||
    !profile.businessId ||
    !profile.storeId ||
    (profile.status !== undefined && profile.status !== "ACTIVE")
  )
    return (
      <View className="p-5">
        <Text accessibilityRole="alert">
          This original quotation link or current business and Store access is
          unavailable.
        </Text>
      </View>
    )
  const target = parsed.data
  const scope = {
    actorUserId: profile.id,
    tenantId: profile.businessId,
    storeId: profile.storeId,
  }
  return (
    <OriginalQuote
      key={key}
      target={target}
      scope={scope}
      isCurrent={() => fence.isCurrent(key)}
    />
  )
}
function OriginalQuote({
  target,
  scope,
  isCurrent,
}: { target: Target; scope: NativeQuoteScope; isCurrent: () => boolean }) {
  const trpc = useTRPC()
  const [mount] = useState(nextReadMount)
  const context = useQuery(
    mountOwnedRead(trpc.tenant.current.queryOptions(undefined, options), mount),
  )
  const current = freshShownRead(context)
  const scopeReady =
    current.state === "ready" && nativeQuoteScopeMatches(current.data, scope)
  const query = useQuery(
    mountOwnedRead(
      trpc.serviceCommerce.assistantQuoteApprovalDetail.queryOptions(
        {
          approvalId: target.approvalId,
          quoteId: target.quoteId,
          quoteVersionId: target.quoteVersionId,
        },
        { ...options, enabled: scopeReady },
      ),
      mount,
    ),
  )
  const fresh = freshShownRead(query)
  const detail =
    scopeReady &&
    fresh.state === "ready" &&
    fresh.data.id === target.approvalId &&
    fresh.data.quoteId === target.quoteId &&
    fresh.data.quoteVersionId === target.quoteVersionId
      ? fresh.data
      : null
  const refused =
    current.state === "refused" ||
    (current.state === "ready" && !scopeReady) ||
    (scopeReady &&
      (fresh.state === "refused" || (fresh.state === "ready" && !detail)))
  async function refresh() {
    const value = await context.refetch()
    if (
      isCurrent() &&
      value.isSuccess &&
      nativeQuoteScopeMatches(value.data, scope)
    )
      await query.refetch()
  }
  if (!detail)
    return (
      <View className="gap-3 p-5">
        <Text accessibilityRole={refused ? "alert" : undefined}>
          {refused
            ? "This original quotation is unavailable for your current business, Store or access."
            : "Checking current access to the exact original quotation version…"}
        </Text>
        {refused ? (
          <ActionButton variant="outline" onPress={() => void refresh()}>
            Retry original quotation
          </ActionButton>
        ) : null}
      </View>
    )
  return (
    <ScrollView
      contentContainerStyle={{ gap: 16, padding: 18, paddingBottom: 36 }}
    >
      <Section title={`Original quotation version ${detail.version}`}>
        <Text className="text-lg font-bold text-foreground">
          {money(detail.totalMinor, detail.currencyCode)}
        </Text>
        <Text>Stored decision: {human(detail.status)}</Text>
        <Text>Saved policy revision: {detail.policyRevision}</Text>
        <Text>Requested (UTC): {utc(detail.requestedAt)}</Text>
        <Text>Recorded decision (UTC): {utc(detail.decidedAt)}</Text>
        <Text>
          Recorded decision actor membership:{" "}
          {detail.decidedByMembershipId ?? "Not recorded"}
        </Text>
        <Text>Original reason: {detail.reason ?? "Not recorded"}</Text>
        <Text>Expiry (UTC): {utc(detail.expiresAt)}</Text>
        <Text className="text-xs text-muted-foreground">
          The actor is the membership reference saved with the decision; a
          historical name snapshot is not supplied. Missing facts are not
          reconstructed from current eligibility.
        </Text>
      </Section>
      <Section title="Current eligibility">
        <Text>
          {detail.currentReview.stale
            ? (detail.currentReview.reason ??
              "The original version is unavailable for a current decision.")
            : detail.actions.canApprove
              ? "The current actor is eligible for a separate approval review."
              : "Approval is unavailable to the current actor for this saved decision."}
        </Text>
        <Text>
          Current reject eligibility:{" "}
          {detail.actions.canReject
            ? "eligible for a separate review"
            : "unavailable"}
          .
        </Text>
        <Text>
          Current eligibility does not change the stored decision. This read
          performs no approval, rejection, reconciliation or release. Customer
          acceptance, an Order, payment and clinical release remain separate.
        </Text>
      </Section>
      <Section title="Saved offer options">
        <Text>
          Each option has its own total. These are alternatives; option totals
          are not added together.
        </Text>
        {detail.options.length ? (
          detail.options.map((option) => (
            <View key={option.id} className="gap-3 border-t border-border pt-3">
              <Text className="font-bold text-foreground">
                {option.label} · {money(option.totalMinor, detail.currencyCode)}
              </Text>
              <Text>
                Saved availability: {human(option.availabilityOutcome)}.
              </Text>
              {option.lines.length ? (
                option.lines.map((line, index) => (
                  <SavedLine
                    key={`${option.id}:${index}`}
                    line={line}
                    currency={detail.currencyCode}
                  />
                ))
              ) : (
                <Text>No saved lines in this option.</Text>
              )}
            </View>
          ))
        ) : (
          <Text>No saved offer options recorded for this version.</Text>
        )}
      </Section>
      <ActionButton variant="outline" onPress={() => void refresh()}>
        Refresh original quotation
      </ActionButton>
    </ScrollView>
  )
}
function SavedLine({
  line,
  currency,
}: { line: Detail["options"][number]["lines"][number]; currency: string }) {
  return (
    <View className="gap-1 border-t border-border pt-3">
      <Text className="font-medium text-foreground">
        {line.offeringName ?? line.catalogItemName ?? "Saved item"}
        {line.variantName ? ` · ${line.variantName}` : ""}
      </Text>
      <Text>
        {human(line.outcome)} · quantity {line.quantity ?? "Not recorded"}
      </Text>
      <Text>
        Unit price {money(line.unitPriceMinor, currency)} · line total{" "}
        {money(line.totalMinor, currency)}
      </Text>
    </View>
  )
}
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <ListCard>
      <View className="gap-3 py-3">
        <Text
          accessibilityRole="header"
          className="text-base font-bold text-foreground"
        >
          {title}
        </Text>
        {children}
      </View>
    </ListCard>
  )
}
