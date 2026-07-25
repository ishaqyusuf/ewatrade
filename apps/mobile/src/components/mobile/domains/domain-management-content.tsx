import { ActionButton } from "@/components/mobile/action-button"
import { StatusBadge } from "@/components/mobile/status-badge"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Input } from "@/components/ui/input-2"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { useBusinessStore } from "@/store/businessStore"
import { useTRPC } from "@/trpc/client"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import * as Clipboard from "expo-clipboard"
import * as Linking from "expo-linking"
import { useRef, useState } from "react"
import { RefreshControl } from "react-native"
import { KeyboardAwareScrollView } from "react-native-keyboard-controller"
import {
  DomainOwnerForm,
  type MobileDomainRegistrant,
} from "./domain-owner-form"

type Step =
  | "list"
  | "search"
  | "owner"
  | "review"
  | "details"
  | "connect"
  | "verify"
  | "progress"

function formatMoney(amountMinor: number, currencyCode: string) {
  return new Intl.NumberFormat("en-NG", {
    currency: currencyCode,
    style: "currency",
  }).format(amountMinor / 100)
}

export function DomainManagementContent({
  initialOrderId = null,
}: {
  initialOrderId?: string | null
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const auth = useAuthContext()
  const activeBusinessId = useBusinessStore((state) => state.activeBusinessId)
  const [step, setStep] = useState<Step>(initialOrderId ? "progress" : "list")
  const [domain, setDomain] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [quote, setQuote] = useState<{
    id: string
    normalizedDomain: string
    provider: "EXTERNAL" | "GO54" | "OPENPROVIDER"
    retailCurrencyCode: string
    retailPriceMinor: number
  } | null>(null)
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [profileId, setProfileId] = useState<string | null>(null)
  const [orderId, setOrderId] = useState<string | null>(initialOrderId)
  const [selectedConnectionId, setSelectedConnectionId] = useState<
    string | null
  >(null)
  const [verification, setVerification] = useState<{
    connectionId: string
    name: string | null
    value: string | null
  } | null>(null)
  const checkoutKey = useRef(
    `mobile-domain-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )
  const domains = useQuery(trpc.domains.list.queryOptions({}, { retry: false }))
  const profile = useQuery(
    trpc.domains.registrantProfile.queryOptions(undefined, { retry: false }),
  )
  const order = useQuery({
    ...trpc.domains.order.queryOptions({ orderId: orderId ?? "" }),
    enabled: step === "progress" && Boolean(orderId),
    refetchInterval: (query) => {
      const current = query.state.data
      if (
        current?.registrationStatus === "REGISTERED" ||
        current?.paymentStatus === "REFUNDED"
      ) {
        return false
      }
      return current?.registrationStatus === "UNCERTAIN" ? 30_000 : 5_000
    },
  })
  const availability = useMutation(
    trpc.domains.checkAvailability.mutationOptions({
      onError: (mutationError) => setError(mutationError.message),
      onSuccess: (result) => {
        if (
          !result.available ||
          !result.quote ||
          result.quote.provider === "EXTERNAL"
        ) {
          setError("That domain is unavailable. Try another name.")
          return
        }
        setQuote(result.quote)
        setTermsAccepted(false)
        if (profile.data) {
          setProfileId(profile.data.id)
          setStep("review")
        } else {
          setStep("owner")
        }
      },
    }),
  )
  const saveOwner = useMutation(
    trpc.domains.saveRegistrantProfile.mutationOptions({
      onError: (mutationError) => setError(mutationError.message),
      onSuccess: async (result) => {
        setProfileId(result.id)
        await queryClient.invalidateQueries(
          trpc.domains.registrantProfile.queryFilter(),
        )
        setStep("review")
      },
    }),
  )
  const checkout = useMutation(
    trpc.domains.createCheckout.mutationOptions({
      onError: (mutationError) => setError(mutationError.message),
      onSuccess: async (result) => {
        setOrderId(result.id)
        setStep("progress")
        if (result.checkoutUrl) await Linking.openURL(result.checkoutUrl)
      },
    }),
  )
  const connect = useMutation(
    trpc.domains.connectExternal.mutationOptions({
      onError: (mutationError) => setError(mutationError.message),
      onSuccess: (result) => {
        setVerification({
          connectionId: result.id,
          name: result.verification.name,
          value: result.verification.value,
        })
        setStep("verify")
      },
    }),
  )
  const verify = useMutation(
    trpc.domains.verifyConnection.mutationOptions({
      onError: (mutationError) => setError(mutationError.message),
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.domains.list.queryFilter())
        setStep("list")
      },
    }),
  )
  const selectedConnection =
    domains.data?.find((item) => item.id === selectedConnectionId) ?? null
  const registrationComplete = order.data?.registrationStatus === "REGISTERED"
  const registrationFailed = order.data?.registrationStatus === "FAILED"
  const registrationUncertain = order.data?.registrationStatus === "UNCERTAIN"

  function reset() {
    setDomain("")
    setError(null)
    setOrderId(null)
    setQuote(null)
    setSelectedConnectionId(null)
    setTermsAccepted(false)
    setVerification(null)
    setStep("list")
  }

  if (!activeBusinessId) {
    return (
      <View className="flex-1 items-center justify-center px-6">
        <StatusBanner
          icon="Globe"
          message="Select a business before managing its storefront domain."
          title="No active business"
          tone="muted"
        />
      </View>
    )
  }

  return (
    <KeyboardAwareScrollView
      bottomOffset={140}
      contentContainerClassName="gap-5 px-5 pb-32"
      keyboardShouldPersistTaps="handled"
      refreshControl={
        step === "list" ? (
          <RefreshControl
            onRefresh={() => void domains.refetch()}
            refreshing={domains.isRefetching}
          />
        ) : undefined
      }
      showsVerticalScrollIndicator={false}
    >
      {step !== "list" ? (
        <Pressable
          accessibilityRole="button"
          className="self-start py-2"
          haptic
          onPress={reset}
        >
          <Text className="text-sm font-bold text-primary">All domains</Text>
        </Pressable>
      ) : null}

      {step === "list" ? (
        <>
          <View className="gap-1">
            <Text className="text-sm leading-5 text-muted-foreground">
              Buy a Nigerian .com.ng, a global .com, or connect one you already
              own. Registration, DNS, and SSL are handled from here.
            </Text>
          </View>
          <View className="flex-row gap-3">
            <ActionButton
              className="flex-1"
              icon="Globe"
              onPress={() => setStep("search")}
            >
              Buy domain
            </ActionButton>
            <ActionButton
              className="flex-1"
              onPress={() => setStep("connect")}
              variant="outline"
            >
              Connect
            </ActionButton>
          </View>
          <View className="mt-2">
            <Text className="mb-2 text-lg font-extrabold text-foreground">
              Your domains
            </Text>
            {domains.data?.length ? (
              domains.data.map((item) => (
                <Pressable
                  accessibilityRole="button"
                  className="flex-row items-center gap-3 border-t border-border py-4"
                  haptic
                  key={item.id}
                  onPress={() => {
                    setSelectedConnectionId(item.id)
                    setStep("details")
                  }}
                >
                  <View className="min-w-0 flex-1 gap-1">
                    <Text
                      className="font-extrabold text-foreground"
                      numberOfLines={1}
                    >
                      {item.hostname}
                    </Text>
                    <Text className="text-sm text-muted-foreground">
                      {item.provider.toLowerCase()} · {item.store.name}
                    </Text>
                  </View>
                  <StatusBadge
                    label={item.status.toLowerCase().replaceAll("_", " ")}
                    tone={item.status === "ACTIVE" ? "primary" : "muted"}
                  />
                </Pressable>
              ))
            ) : (
              <View className="border-t border-border py-8">
                <Text className="text-sm text-muted-foreground">
                  No custom domain yet. Your free EwaTrade storefront address
                  remains available.
                </Text>
              </View>
            )}
          </View>
        </>
      ) : null}

      {step === "details" && selectedConnection ? (
        <View className="gap-5">
          <View className="gap-1 border-b border-border pb-5">
            <Text className="text-sm text-muted-foreground">Domain</Text>
            <Text className="text-2xl font-extrabold text-foreground">
              {selectedConnection.hostname}
            </Text>
            <Text className="text-sm text-muted-foreground">
              {selectedConnection.provider.toLowerCase()} ·{" "}
              {selectedConnection.status.toLowerCase().replaceAll("_", " ")}
            </Text>
          </View>
          {selectedConnection.status !== "ACTIVE" &&
          selectedConnection.verification.name &&
          selectedConnection.verification.value ? (
            <View className="gap-4 border-b border-border pb-5">
              <Text className="font-bold text-foreground">
                Add this {selectedConnection.verification.type ?? "TXT"} record
                at your DNS provider
              </Text>
              <View className="gap-1">
                <Text className="text-sm text-muted-foreground">Name</Text>
                <Text selectable className="font-mono text-foreground">
                  {selectedConnection.verification.name}
                </Text>
              </View>
              <View className="gap-1">
                <Text className="text-sm text-muted-foreground">Value</Text>
                <Text selectable className="font-mono text-foreground">
                  {selectedConnection.verification.value}
                </Text>
              </View>
              <ActionButton
                onPress={() =>
                  Clipboard.setStringAsync(
                    `${selectedConnection.verification.name}\n${selectedConnection.verification.value}`,
                  )
                }
                variant="outline"
              >
                Copy DNS record
              </ActionButton>
            </View>
          ) : null}
          <ActionButton
            onPress={() =>
              Clipboard.setStringAsync(`https://${selectedConnection.hostname}`)
            }
            variant="outline"
          >
            Copy storefront URL
          </ActionButton>
          {selectedConnection.status !== "ACTIVE" ? (
            <ActionButton
              isLoading={verify.isPending}
              loadingLabel="Checking"
              onPress={() =>
                verify.mutate({ connectionId: selectedConnection.id })
              }
            >
              Check connection
            </ActionButton>
          ) : null}
        </View>
      ) : null}

      {step === "search" ? (
        <View className="gap-5">
          <View className="gap-1">
            <Text className="text-lg font-extrabold text-foreground">
              Find your domain
            </Text>
            <Text className="text-sm leading-5 text-muted-foreground">
              Search .com.ng or .com. Prices are final and displayed in NGN.
            </Text>
          </View>
          <Input
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setDomain}
            placeholder="yourbusiness.com.ng"
            value={domain}
          />
          {error ? (
            <Text className="text-sm text-destructive">{error}</Text>
          ) : null}
          <ActionButton
            disabled={!domain.trim()}
            isLoading={availability.isPending}
            loadingLabel="Checking"
            onPress={() => {
              setError(null)
              availability.mutate({
                domain,
                storeId: activeBusinessId,
              })
            }}
          >
            Check availability
          </ActionButton>
        </View>
      ) : null}

      {step === "owner" ? (
        <DomainOwnerForm
          businessName={auth.profile?.businessName}
          email={auth.profile?.email}
          fullName={auth.profile?.name}
          isSaving={saveOwner.isPending}
          onBack={() => setStep("search")}
          onSave={(registrant: MobileDomainRegistrant) => {
            setError(null)
            saveOwner.mutate(registrant)
          }}
        />
      ) : null}

      {step === "review" && quote ? (
        <View className="gap-5">
          <View className="gap-1 border-b border-border pb-5">
            <Text className="text-sm text-muted-foreground">Domain</Text>
            <Text className="text-2xl font-extrabold text-foreground">
              {quote.normalizedDomain}
            </Text>
          </View>
          <View className="flex-row items-end justify-between gap-4 border-b border-border pb-5">
            <Text className="text-sm text-muted-foreground">One year</Text>
            <Text className="text-2xl font-extrabold text-foreground">
              {formatMoney(quote.retailPriceMinor, quote.retailCurrencyCode)}
            </Text>
          </View>
          <Text className="text-sm leading-5 text-muted-foreground">
            By paying, you authorize EwaTrade to register this domain using the
            saved legal owner details. Setup continues even if you close the
            app.
          </Text>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: termsAccepted }}
            className="flex-row items-start gap-3 border-y border-border py-4"
            haptic
            onPress={() => setTermsAccepted((current) => !current)}
          >
            <View
              className={
                termsAccepted
                  ? "mt-0.5 h-6 w-6 items-center justify-center rounded-md border border-primary bg-primary"
                  : "mt-0.5 h-6 w-6 items-center justify-center rounded-md border border-border bg-background"
              }
            >
              {termsAccepted ? (
                <Text className="font-bold text-primary-foreground">✓</Text>
              ) : null}
            </View>
            <View className="min-w-0 flex-1 gap-1">
              <Text className="font-semibold text-foreground">
                Accept domain registration terms
              </Text>
              <Text className="text-sm leading-5 text-muted-foreground">
                I am authorized by the owner and accept the registrar’s
                registration, privacy, and applicable ICANN or NiRA dispute
                policies.
              </Text>
            </View>
          </Pressable>
          <Pressable
            accessibilityRole="link"
            onPress={() =>
              Linking.openURL(
                quote.provider === "GO54"
                  ? "https://go54.com/domain-registrant-agreement"
                  : "https://www.openprovider.com/company/policies",
              )
            }
          >
            <Text className="font-semibold text-primary">
              View registrar policies
            </Text>
          </Pressable>
          {error ? (
            <Text className="text-sm text-destructive">{error}</Text>
          ) : null}
          <ActionButton
            disabled={!profileId || !termsAccepted}
            isLoading={checkout.isPending}
            loadingLabel="Opening checkout"
            onPress={() => {
              if (!profileId) return
              checkout.mutate({
                idempotencyKey: checkoutKey.current,
                quoteId: quote.id,
                registrantProfileId: profileId,
                surface: "mobile",
                termsVersion: "2026-07-24",
              })
            }}
          >
            Pay securely
          </ActionButton>
        </View>
      ) : null}

      {step === "connect" ? (
        <View className="gap-5">
          <View className="gap-1">
            <Text className="text-lg font-extrabold text-foreground">
              Connect an existing domain
            </Text>
            <Text className="text-sm leading-5 text-muted-foreground">
              Your current registrar stays in control. We verify ownership
              before changing hosting.
            </Text>
          </View>
          <Input
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setDomain}
            placeholder="yourbusiness.com"
            value={domain}
          />
          {error ? (
            <Text className="text-sm text-destructive">{error}</Text>
          ) : null}
          <ActionButton
            disabled={!domain.trim()}
            isLoading={connect.isPending}
            loadingLabel="Preparing"
            onPress={() =>
              connect.mutate({
                domain,
                storeId: activeBusinessId,
              })
            }
          >
            Continue
          </ActionButton>
        </View>
      ) : null}

      {step === "verify" && verification ? (
        <View className="gap-5">
          <StatusBanner
            icon="Globe"
            message="Add this TXT record at your DNS provider. It does not interrupt your current website."
            title="Verify ownership"
            tone="primary"
          />
          <Pressable
            accessibilityRole="button"
            className="gap-2 border-y border-border py-5"
            haptic
            onPress={() =>
              void Clipboard.setStringAsync(verification.name ?? "")
            }
          >
            <Text className="text-xs font-bold uppercase text-muted-foreground">
              Name · tap to copy
            </Text>
            <Text className="font-mono text-sm text-foreground">
              {verification.name}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            className="gap-2 border-b border-border pb-5"
            haptic
            onPress={() =>
              void Clipboard.setStringAsync(verification.value ?? "")
            }
          >
            <Text className="text-xs font-bold uppercase text-muted-foreground">
              Value · tap to copy
            </Text>
            <Text className="font-mono text-sm text-foreground">
              {verification.value}
            </Text>
          </Pressable>
          {error ? (
            <Text className="text-sm text-destructive">{error}</Text>
          ) : null}
          <ActionButton
            isLoading={verify.isPending}
            loadingLabel="Checking DNS"
            onPress={() =>
              verify.mutate({ connectionId: verification.connectionId })
            }
          >
            I added the record
          </ActionButton>
        </View>
      ) : null}

      {step === "progress" ? (
        <View className="gap-5">
          <StatusBanner
            icon="Globe"
            message={
              registrationComplete
                ? "Registration is complete. DNS and SSL can take a few more minutes."
                : registrationUncertain
                  ? "The registrar result is still being reconciled. You will not be charged again."
                  : registrationFailed
                    ? order.data?.paymentStatus === "REFUNDED"
                      ? "Registration failed and your payment was refunded."
                      : "Registration failed. Your refund is being processed or reviewed."
                    : "Payment and registration continue safely in the background."
            }
            title={
              registrationComplete
                ? "Domain registered"
                : registrationUncertain
                  ? "Confirming registrar result"
                  : registrationFailed
                    ? "Registration failed"
                    : "Setting up your domain"
            }
            tone={
              registrationComplete
                ? "success"
                : registrationUncertain
                  ? "warning"
                  : registrationFailed
                    ? "destructive"
                    : "primary"
            }
          />
          <View className="gap-4 border-y border-border py-5">
            <View className="flex-row justify-between gap-4">
              <Text className="text-sm text-muted-foreground">Payment</Text>
              <Text className="text-sm font-extrabold text-foreground">
                {order.data?.paymentStatus ?? "Checking"}
              </Text>
            </View>
            <View className="flex-row justify-between gap-4">
              <Text className="text-sm text-muted-foreground">
                Registration
              </Text>
              <Text className="text-sm font-extrabold text-foreground">
                {order.data?.registrationStatus ?? "Waiting"}
              </Text>
            </View>
          </View>
          <ActionButton onPress={reset} variant="outline">
            Back to domains
          </ActionButton>
        </View>
      ) : null}
    </KeyboardAwareScrollView>
  )
}
