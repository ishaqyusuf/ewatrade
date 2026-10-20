import { Text } from "@/components/ui/text"
import { useTRPC } from "@/trpc/client"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "expo-router"
import { useEffect, useState } from "react"
import { QuietHeader } from "./account-privacy/quiet-settings"
import { ActionButton } from "./action-button"
import { FormField } from "./form-field"
import { MobileScreen } from "./screen"
import { StatusBanner } from "./status-banner"

export function AccountPhoneScreen() {
  const router = useRouter()
  const trpc = useTRPC()
  const cache = useQueryClient()
  const [code, setCode] = useState("")
  const [cooldown, setCooldown] = useState(0)
  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])
  const status = useQuery(
    trpc.auth.accountPhoneStatus.queryOptions(undefined, { retry: false }),
  )
  const request = useMutation(
    trpc.auth.requestAccountPhoneOtp.mutationOptions({
      onSuccess: () => {
        setCode("")
        setCooldown(60)
      },
    }),
  )
  const verify = useMutation(
    trpc.auth.verifyAccountPhoneOtp.mutationOptions({
      onSuccess: () => {
        setCode("")
        void cache.invalidateQueries({
          queryKey: trpc.auth.accountPhoneStatus.queryKey(),
        })
      },
    }),
  )
  const busy = request.isPending || verify.isPending
  const verified = status.data?.verified === true || verify.isSuccess
  const canSend =
    status.isSuccess &&
    status.data.enabled &&
    status.data.canVerify &&
    !busy &&
    !verified &&
    cooldown === 0
  const error = request.error?.message ?? verify.error?.message
  return (
    <MobileScreen contentClassName="gap-5 px-[18px] py-2">
      <QuietHeader
        backLabel="Account"
        onBack={() => router.back()}
        title="Phone sign-in"
      />
      <Text className="text-base leading-6 text-foreground">
        Verify the phone number on your account once. Afterward, sign in using
        your phone number and a WhatsApp code.
      </Text>
      {status.data?.phone ? (
        <Text className="text-lg font-semibold text-foreground">
          {status.data.phone}
        </Text>
      ) : null}
      {verified ? (
        <StatusBanner
          title="Phone verified"
          message="You can sign in with this phone number and a WhatsApp code."
        />
      ) : (
        <>
          {status.isPending ? (
            <Text>Checking your phone…</Text>
          ) : status.isError ? (
            <StatusBanner
              title="Couldn’t check your phone"
              message={status.error.message}
              tone="destructive"
              actionLabel="Retry"
              actionDisabled={status.isFetching}
              onActionPress={() => void status.refetch()}
            />
          ) : !status.data?.phone ? (
            <StatusBanner message="Your account does not have a phone number. Contact support for help." />
          ) : !status.data.enabled ? (
            <StatusBanner message="WhatsApp phone verification is not available yet. Please try again later." />
          ) : !status.data.canVerify ? (
            <StatusBanner message="Sign in with your existing verified account to enable phone sign-in." />
          ) : null}
          <ActionButton
            disabled={!canSend}
            isLoading={request.isPending}
            loadingLabel="Sending code…"
            onPress={() => {
              verify.reset()
              request.mutate({})
            }}
          >
            {cooldown > 0
              ? `Send again in ${cooldown}s`
              : request.isSuccess
                ? "Send another WhatsApp code"
                : "Send WhatsApp code"}
          </ActionButton>
          {request.isSuccess ? (
            <>
              <Text className="text-sm leading-6 text-muted-foreground">
                {request.data.devCode
                  ? `Local test code: ${request.data.devCode}. No WhatsApp message was sent.`
                  : "Enter the code sent to your WhatsApp. It expires in five minutes."}
              </Text>
              <FormField
                label="WhatsApp code"
                keyboardType="number-pad"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                editable={!busy}
                onChangeText={setCode}
              />
              <ActionButton
                disabled={busy || !/^\d{6}$/.test(code)}
                isLoading={verify.isPending}
                loadingLabel="Verifying…"
                onPress={() => verify.mutate({ code })}
              >
                Verify phone
              </ActionButton>
            </>
          ) : null}
        </>
      )}
      {error ? <StatusBanner message={error} tone="destructive" /> : null}
    </MobileScreen>
  )
}
