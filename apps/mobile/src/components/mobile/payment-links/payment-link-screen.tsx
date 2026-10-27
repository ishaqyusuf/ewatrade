import { ActionButton } from "@/components/mobile/action-button"
import { ClassicCustomerBookFilter } from "@/components/mobile/appearances/classic/customer-book-screen"
import { FinanceFormBody } from "@/components/mobile/finance/finance-form-body"
import { FinanceChoice } from "@/components/mobile/finance/finance-ledger-layout"
import { HeroCard } from "@/components/mobile/green-till/hero-card"
import { SectionHeader, ToggleRow } from "@/components/mobile/green-till/kit"
import { MoneyField } from "@/components/mobile/money-field"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Skeleton, SkeletonGroup } from "@/components/ui/skeleton"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { canRecordOrderPayment } from "@/lib/order-action-eligibility"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import {
  formatMinorMoney,
  majorToMinor,
  minorToMajorInput,
} from "@ewatrade/utils"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import * as Clipboard from "expo-clipboard"
import * as Crypto from "expo-crypto"
import { type Href, useRouter } from "expo-router"
import { useState } from "react"
import { Linking, Share } from "react-native"
import { CustomerMessageEditor } from "./customer-message-editor"
import {
  DEFAULT_PAYMENT_LINK_LIFETIME,
  PAYMENT_LINK_LIFETIMES,
  accountSuffix,
  errorCode,
  errorMessage,
  isOwnerOrAdmin,
  newOperationId,
  shortDateTime,
} from "./payment-link-model"
import { FactCard, InfoNote } from "./payment-link-parts"

type CreatedLink = RouterOutputs["businessBanking"]["createPaymentLink"]

const newLinkId = () => newOperationId("link", Crypto.randomUUID())

/** Create a bank-transfer payment link for one Order (sale or service). */
export function PaymentLinkScreen({ orderId }: { orderId: string }) {
  const trpc = useTRPC()
  const router = useRouter()
  const queryClient = useQueryClient()
  const offline = useOperationalModeStore((state) => state.isOfflineMode)
  const { profile } = useAuthContext()
  const manager = isOwnerOrAdmin(profile?.role)
  const order = useQuery(
    trpc.orders.get.queryOptions(
      { orderId },
      { enabled: !offline && Boolean(orderId), retry: false },
    ),
  )
  const candidates = useQuery(
    trpc.businessBanking.linkCandidates.queryOptions(
      { period: "today" },
      { enabled: !offline, retry: false },
    ),
  )
  const [accountId, setAccountId] = useState<string | null>(null)
  const [allowPartial, setAllowPartial] = useState(false)
  const [requestedAmount, setRequestedAmount] = useState<string | null>(null)
  const [lifetime, setLifetime] = useState<number>(
    DEFAULT_PAYMENT_LINK_LIFETIME,
  )
  // Stable per attempt; a new one only after a success or a settings change.
  const [clientLinkId, setClientLinkId] = useState(newLinkId)
  const [created, setCreated] = useState<CreatedLink | null>(null)
  const [problem, setProblem] = useState<{
    code: string | null
    message: string
  } | null>(null)
  const create = useMutation(
    trpc.businessBanking.createPaymentLink.mutationOptions({
      onError: (failure) =>
        setProblem({
          code: errorCode(failure),
          message: errorMessage(failure, "The link couldn't be created."),
        }),
      onSuccess: (result) => {
        setProblem(null)
        setCreated(result)
        setClientLinkId(newLinkId())
        void queryClient.invalidateQueries(
          trpc.businessBanking.linkCandidates.pathFilter(),
        )
      },
    }),
  )
  const accounts = candidates.data?.accounts ?? []
  const chosen =
    accounts.find((account) => account.id === accountId) ??
    (accounts.length === 1 ? accounts[0] : undefined)
  function changeSetting(apply: () => void) {
    apply()
    setProblem(null)
    setClientLinkId(newLinkId())
  }

  if (offline)
    return (
      <View className="px-[18px]">
        <StatusBanner
          icon="WifiOff"
          title="Reconnect to create a link"
          message="Payment links need a fresh look at the order balance."
          tone="warning"
        />
      </View>
    )
  if (order.isPending || candidates.isPending)
    return (
      <View className="px-[18px]">
        <SkeletonGroup accessibilityLabel="Loading payment link">
          <View className="gap-4">
            <Skeleton height={150} radius={26} />
            <Skeleton height={120} radius={20} />
            <Skeleton height={60} radius={20} />
          </View>
        </SkeletonGroup>
      </View>
    )
  if (order.isError || candidates.isError) {
    const failure = order.error ?? candidates.error
    return (
      <View className="px-[18px]">
        <StatusBanner
          icon="AlertCircle"
          title={
            errorCode(failure) === "FORBIDDEN"
              ? "Not permitted"
              : "Payment link unavailable"
          }
          message={
            errorCode(failure) === "FORBIDDEN"
              ? "Only staff who can take payments on orders can create payment links."
              : errorMessage(failure, "Try again in a moment.")
          }
          tone="destructive"
          actionLabel={
            errorCode(failure) === "FORBIDDEN" ? undefined : "Try again"
          }
          onActionPress={() => {
            void order.refetch()
            void candidates.refetch()
          }}
        />
      </View>
    )
  }
  const data = order.data
  const who = data.customerName || "Walk-in customer"

  if (created)
    return (
      <LinkReady
        created={created}
        customer={who}
        onCreateAnother={() => setCreated(null)}
        onDone={() =>
          router.canGoBack() ? router.back() : router.replace("/dashboard")
        }
        orderNumber={data.orderNumber}
      />
    )

  const nothingDue = !canRecordOrderPayment(data)
  const amountText = requestedAmount ?? minorToMajorInput(data.balanceDueMinor)
  const amountMinor = majorToMinor(amountText)
  const amountValid =
    amountMinor !== null &&
    amountMinor > 0 &&
    amountMinor <= data.balanceDueMinor &&
    amountMinor <= 100_000_000
  return (
    <FinanceFormBody>
      <HeroCard
        label="Balance due"
        amount={formatMinorMoney(data.balanceDueMinor, data.currencyCode)}
        sub={`${data.orderNumber} · ${who}`}
        pill={{ label: "Bank transfer", tone: "synced" }}
      />
      {nothingDue ? (
        <StatusBanner
          icon="CircleCheck"
          title="Nothing to pay"
          message={`${data.orderNumber} has no balance due, so it doesn't need a payment link.`}
          tone="success"
        />
      ) : data.currencyCode !== "NGN" ? (
        <StatusBanner
          icon="Info"
          title="Naira orders only"
          message="Payment links work for orders priced in NGN."
          tone="warning"
        />
      ) : accounts.length === 0 ? (
        <StatusBanner
          icon="Building2"
          title="No bank account ready"
          message={
            manager
              ? "Add bank details to a bank money account first. Customers pay into it and you confirm each payment yourself."
              : "An owner or admin needs to add bank details in Finance before you can send payment links."
          }
          tone="warning"
          actionLabel={manager ? "Add bank details" : undefined}
          onActionPress={
            manager
              ? () => router.push("/finance-accounts-modal" as Href)
              : undefined
          }
        />
      ) : (
        <>
          <View>
            <SectionHeader title="Customers pay into" />
            <View className="gap-2">
              {accounts.map((account) => (
                <FinanceChoice
                  key={account.id}
                  label={`${account.name} · ${account.bankName ?? "Bank"} ${accountSuffix(account.accountSuffix)}`}
                  selected={chosen?.id === account.id}
                  disabled={create.isPending}
                  onPress={() => changeSetting(() => setAccountId(account.id))}
                />
              ))}
            </View>
            <View className="mt-2">
              <InfoNote>
                Accounts with bank details. The link shows these details to the
                customer.
              </InfoNote>
            </View>
          </View>
          <MoneyField
            currencyCode={data.currencyCode}
            label="Amount requested"
            value={amountText}
            editable={!create.isPending}
            onChangeValue={(value) =>
              changeSetting(() => setRequestedAmount(value))
            }
          />
          {!amountValid ? (
            <StatusBanner
              tone="warning"
              message={`Enter an amount up to ${formatMinorMoney(Math.min(data.balanceDueMinor, 100_000_000), data.currencyCode)}.`}
            />
          ) : null}
          <View className="rounded-[20px] bg-card px-3.5 shadow-sm">
            <ToggleRow
              disabled={create.isPending}
              title="Customer can change the amount"
              sub="For part payments. They can't enter more than the balance."
              value={allowPartial}
              onValueChange={(value) =>
                changeSetting(() => setAllowPartial(value))
              }
            />
          </View>
          <View>
            <SectionHeader title="Link works for" />
            <View className="flex-row flex-wrap gap-2">
              {PAYMENT_LINK_LIFETIMES.map((option) => (
                <ClassicCustomerBookFilter
                  key={option.minutes}
                  active={lifetime === option.minutes}
                  label={option.label}
                  onPress={() =>
                    changeSetting(() => setLifetime(option.minutes))
                  }
                />
              ))}
            </View>
            <View className="mt-2">
              <InfoNote>Up to 72 hours. Create a new link after that.</InfoNote>
            </View>
          </View>
          {problem ? (
            <StatusBanner
              icon="AlertCircle"
              title={
                problem.code === "FORBIDDEN"
                  ? "Not permitted"
                  : problem.code === "CONFLICT"
                    ? "Check the order"
                    : "Link not created"
              }
              message={
                problem.code === "FORBIDDEN"
                  ? "Only staff who can take payments in this Store can create payment links."
                  : problem.message
              }
              tone="destructive"
            />
          ) : null}
          <ActionButton
            disabled={!chosen || !amountValid || create.isPending}
            icon="Link"
            isLoading={create.isPending}
            loadingLabel="Creating…"
            onPress={() => {
              if (!chosen || !amountValid || amountMinor === null) return
              setProblem(null)
              create.mutate({
                orderId: data.id,
                bankAccountId: chosen.id,
                clientLinkId,
                amountMinor,
                allowPartial,
                lifetimeMinutes: lifetime,
              })
            }}
          >
            Create link
          </ActionButton>
          <InfoNote>
            The customer transfers to your bank and taps I have paid. Nothing is
            recorded until you check your bank and confirm.
          </InfoNote>
        </>
      )}
    </FinanceFormBody>
  )
}

function LinkReady({
  created,
  customer,
  onCreateAnother,
  onDone,
  orderNumber,
}: {
  created: CreatedLink
  customer: string
  onCreateAnother: () => void
  onDone: () => void
  orderNumber: string
}) {
  const [status, setStatus] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  return (
    <FinanceFormBody>
      <HeroCard
        label="Payment link ready"
        amount={formatMinorMoney(created.amountMinor, created.currencyCode)}
        pill={{ label: "Active · not paid", tone: "draft" }}
        sub={`${orderNumber} · works until ${shortDateTime(created.expiresAt)}`}
      />
      <View className="gap-3 rounded-[20px] bg-card p-3.5 shadow-sm">
        <Text className="text-sm font-semibold text-foreground" selectable>
          {created.url}
        </Text>
        <View className="flex-row gap-3">
          <View className="flex-1">
            <ActionButton
              icon="Copy"
              onPress={() => {
                setProblem(null)
                void Clipboard.setStringAsync(created.url).then(
                  () => setStatus("Link copied."),
                  () =>
                    setProblem("Copy didn't work. Select the link instead."),
                )
              }}
            >
              Copy link
            </ActionButton>
          </View>
          {created.whatsappUrl ? (
            <View className="flex-1">
              <ActionButton
                icon="Share"
                variant="outline"
                onPress={() => {
                  setProblem(null)
                  void Share.share({
                    message: created.url,
                    url: created.url,
                  }).catch(() =>
                    setProblem("Sharing isn't available. Copy the link."),
                  )
                }}
              >
                Share
              </ActionButton>
            </View>
          ) : null}
        </View>
        <ActionButton
          icon="Globe"
          variant="ghost"
          onPress={() =>
            void Linking.openURL(created.url).catch(() =>
              setProblem("The page couldn't be opened on this phone."),
            )
          }
        >
          Open page
        </ActionButton>
        {status ? (
          <Text
            accessibilityLiveRegion="polite"
            className="text-xs text-muted-foreground"
          >
            {status}
          </Text>
        ) : null}
        {problem ? <StatusBanner tone="destructive" message={problem} /> : null}
      </View>
      <FactCard
        facts={[
          {
            label: "Amount",
            value: created.allowPartial
              ? "Customer can change it"
              : "Fixed amount",
          },
          { label: "Works until", value: shortDateTime(created.expiresAt) },
        ]}
      />
      <View>
        <SectionHeader title="Send the link" />
        <CustomerMessageEditor
          initialText={created.copyText}
          label="Message to the customer"
          noPhoneMessage={`${customer} has no phone number saved. Copy the message and send it your way.`}
          whatsappUrl={created.whatsappUrl}
        />
      </View>
      <View className="flex-row gap-3">
        <View className="flex-1">
          <ActionButton variant="outline" onPress={onCreateAnother}>
            New link
          </ActionButton>
        </View>
        <View className="flex-1">
          <ActionButton onPress={onDone}>Done</ActionButton>
        </View>
      </View>
    </FinanceFormBody>
  )
}
