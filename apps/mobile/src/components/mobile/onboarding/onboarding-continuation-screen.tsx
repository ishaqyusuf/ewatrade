import { AuthActionButton, StatusBanner } from "@/components/mobile"
import { AuthFlowScreen } from "@/components/mobile/green-till/auth-screen"
import { AccountAgeEntry } from "@/components/mobile/sign-up/account-age-entry"
import { useAuthContext } from "@/hooks/use-auth"
import {
  type PendingOnboarding,
  clearPendingOnboarding,
  readPendingOnboarding,
  savePendingOnboarding,
} from "@/lib/onboarding-continuation-store"
import { requestOnboardingVerification } from "@/lib/onboarding-web-client"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { useMutation } from "@tanstack/react-query"
import { useLocalSearchParams, useRouter } from "expo-router"
import { useEffect, useState } from "react"

export type ApprovedNativeOnboarding =
  RouterOutputs["auth"]["getMobileOnboarding"] & { accessToken: string }

export function OnboardingContinuationScreen() {
  const params = useLocalSearchParams<{ error?: string }>()
  const trpc = useTRPC()
  const auth = useAuthContext()
  const router = useRouter()
  const [pending, setPending] = useState<PendingOnboarding | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [context, setContext] = useState<ApprovedNativeOnboarding | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [startSetup, setStartSetup] = useState(false)
  const resend = useMutation({
    mutationFn: requestOnboardingVerification,
    gcTime: 0,
  })
  const lookup = useMutation(
    trpc.auth.getMobileOnboarding.mutationOptions({
      gcTime: 0,
      onSuccess(data, input) {
        void savePendingOnboarding(
          {
            kind: "setup",
            token: input.token,
            expiresAt: new Date(data.expiresAt).getTime(),
          },
          input.token,
        )
          .then(() => setContext({ ...data, accessToken: input.token }))
          .catch(() =>
            setMessage(
              "Setup could not be saved securely. Open your email link again.",
            ),
          )
      },
      onError(error) {
        setMessage(error.message)
      },
    }),
  )
  const verification = useMutation(
    trpc.auth.verifyMobileOnboardingEmail.mutationOptions({
      gcTime: 0,
      onSuccess(data, input) {
        void savePendingOnboarding(
          { kind: "setup", token: data.accessToken },
          input.token,
        )
          .then((value) => {
            setPending(value)
            lookup.mutate({ token: value.token })
          })
          .catch(() =>
            setMessage(
              "Setup could not be saved securely. Open your email link again.",
            ),
          )
      },
      onError(error) {
        setMessage(error.message)
      },
    }),
  )
  useEffect(() => {
    let current = true
    void readPendingOnboarding()
      .then((value) => {
        if (!current) return
        setPending(value)
        setLoaded(true)
        if (value?.kind === "setup") lookup.mutate({ token: value.token })
      })
      .catch(() => {
        if (current) {
          setMessage(
            "Setup could not be read securely. Open your email link again.",
          )
          setLoaded(true)
        }
      })
    return () => {
      current = false
    }
  }, [lookup.mutate])

  if (startSetup && context && !auth.isAuthenticated)
    return <AccountAgeEntry continuation={context} />
  const busy = !loaded || lookup.isPending || verification.isPending
  return (
    <AuthFlowScreen
      eyebrow="Email continuation"
      title="Continue your setup"
      subtitle="Pick up where you left off from your ẸwáTrade email."
      backHref="/login"
      backLabel="Back to login"
    >
      {params.error || message ? (
        <StatusBanner
          tone="destructive"
          message={
            message ??
            "Your link could not be saved securely. Open it again from your email."
          }
        />
      ) : null}
      {busy ? (
        <StatusBanner
          icon="Clock"
          title="Checking setup"
          message="Validating your saved email link."
        />
      ) : null}
      {!busy && !pending ? (
        <StatusBanner message="Open your setup or confirmation email to continue. You can start a new signup if the link has expired." />
      ) : null}
      {context ? (
        <StatusBanner
          title={context.businessName}
          message={`Setting up for ${context.email}`}
        />
      ) : null}
      {auth.isAuthenticated && pending ? (
        <>
          <StatusBanner
            message={`You are signed in as ${auth.profile?.email ?? "another account"}. Sign out before creating a workspace from this setup link.`}
          />
          <AuthActionButton
            onPress={() => {
              auth.onLogout()
              router.replace("/continue-onboarding")
            }}
          >
            Sign out and continue
          </AuthActionButton>
        </>
      ) : pending?.kind === "verification" && !context ? (
        <AuthActionButton
          loadingLabel="Verifying…"
          isLoading={busy}
          onPress={() => verification.mutate({ token: pending.token })}
        >
          Verify email and continue
        </AuthActionButton>
      ) : context?.emailVerified ? (
        <AuthActionButton onPress={() => setStartSetup(true)}>
          Continue onboarding
        </AuthActionButton>
      ) : context ? (
        <>
          <StatusBanner message="We sent a confirmation link to your email. Open it on this phone to continue setting up." />
          <AuthActionButton
            isLoading={resend.isPending}
            loadingLabel="Sending…"
            onPress={() => resend.mutate(context.accessToken)}
          >
            Resend the link
          </AuthActionButton>
          {resend.data ? <StatusBanner message={resend.data.message} /> : null}
          {resend.error ? (
            <StatusBanner tone="destructive" message={resend.error.message} />
          ) : null}
        </>
      ) : null}
      {pending?.kind === "setup" && lookup.isError ? (
        <AuthActionButton
          onPress={() => {
            setMessage(null)
            lookup.mutate({ token: pending.token })
          }}
        >
          Try setup again
        </AuthActionButton>
      ) : null}
      {!busy && !context && !auth.isAuthenticated ? (
        <AuthActionButton
          variant="secondary"
          onPress={() => {
            void clearPendingOnboarding(pending?.token)
              .then(() => router.replace("/sign-up"))
              .catch(() =>
                setMessage("Setup could not be cleared securely. Try again."),
              )
          }}
        >
          Start a new signup
        </AuthActionButton>
      ) : null}
      <AuthActionButton
        variant="secondary"
        onPress={() => {
          void clearPendingOnboarding(pending?.token)
            .then(() => router.replace("/login"))
            .catch(() =>
              setMessage("Setup could not be cleared securely. Try again."),
            )
        }}
      >
        Return to sign in
      </AuthActionButton>
    </AuthFlowScreen>
  )
}
