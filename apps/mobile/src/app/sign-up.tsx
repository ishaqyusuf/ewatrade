import {
  AuthActionButton,
  AuthBrandHeader,
  AuthDivider,
  AuthFooterAction,
  AuthMethodButton,
  FormField,
  MobileScreen,
  StatusBanner,
} from "@/components/mobile"
import { useMobileGoogleAuth } from "@/hooks/use-mobile-google-auth"
import { useTRPC } from "@/trpc/client"
import { useMutation } from "@tanstack/react-query"
import { useRouter } from "expo-router"
import { useState } from "react"
import { View } from "react-native"

export default function SignUpRoute() {
  const router = useRouter()
  const trpc = useTRPC()
  const [name, setName] = useState("")
  const [businessName, setBusinessName] = useState("")
  const [email, setEmail] = useState("")
  const [error, setError] = useState<string | null>(null)
  const normalizedEmail = email.trim().toLowerCase()
  const normalizedBusinessName = businessName.trim()
  const canContinueWithGoogle = !!normalizedBusinessName
  const canContinueWithEmail =
    !!name.trim() && !!normalizedBusinessName && !!normalizedEmail
  const googleAuth = useMobileGoogleAuth({
    businessName: normalizedBusinessName,
    mode: "sign_up",
    name: name.trim() || undefined,
    onError: setError,
  })
  const requestOtpMutation = useMutation(
    trpc.auth.requestMobileOwnerOtp.mutationOptions({
      onError(error) {
        setError(
          error.message ||
            "We could not send a production code. You can continue locally while the service is unavailable.",
        )
        router.push({
          pathname: "/verify-email",
          params: {
            businessName: normalizedBusinessName,
            email: normalizedEmail,
            fallback: "local",
            mode: "sign-up",
            name: name.trim(),
          },
        })
      },
      onSuccess() {
        setError(null)
        router.push({
          pathname: "/verify-email",
          params: {
            businessName: normalizedBusinessName,
            email: normalizedEmail,
            mode: "sign-up",
            name: name.trim(),
          },
        })
      },
    }),
  )

  const continueWithEmail = () => {
    if (!canContinueWithEmail) return

    requestOtpMutation.mutate({
      businessName: normalizedBusinessName,
      email: normalizedEmail,
      mode: "sign_up",
      name: name.trim(),
    })
  }

  const continueWithGoogle = () => {
    if (!canContinueWithGoogle) {
      setError("Enter your business name first, then continue with Google.")
      return
    }

    void googleAuth.startGoogleAuth()
  }

  return (
    <MobileScreen
      contentClassName="justify-center gap-7"
      keyboardBottomOffset={420}
    >
      <AuthBrandHeader
        subtitle="Start with only the details needed to create your retail workspace."
        title="Create your business account"
      />

      <View className="gap-3">
        <FormField
          helper="This is the business customers and attendants will see."
          label="Business name"
          leadingIcon="Building2"
          onChangeText={setBusinessName}
          placeholder="Enter your business name"
          value={businessName}
          variant="auth"
        />
        <FormField
          label="Your name"
          leadingIcon="User"
          onChangeText={setName}
          placeholder="Enter your full name"
          textContentType="name"
          value={name}
          variant="auth"
        />
        <FormField
          autoCapitalize="none"
          keyboardType="email-address"
          label="Email address"
          leadingIcon="Mail"
          onChangeText={setEmail}
          placeholder="Enter your email address"
          textContentType="emailAddress"
          value={email}
          variant="auth"
        />
      </View>

      <View className="gap-4">
        <AuthActionButton
          disabled={!canContinueWithEmail}
          isLoading={requestOtpMutation.isPending}
          loadingLabel="Sending code"
          onPress={continueWithEmail}
        >
          Send verification code
        </AuthActionButton>
        {error ? (
          <StatusBanner
            icon="TriangleAlert"
            message={error}
            title="Sign-up needs attention"
            tone="destructive"
          />
        ) : null}
        <AuthDivider label="Or Continue With" />
        <AuthMethodButton
          brandIcon="google"
          disabled={googleAuth.isPending || !canContinueWithGoogle}
          label="Google"
          loadingLabel="Connecting to Google"
          onPress={continueWithGoogle}
          pending={googleAuth.isPending}
        />
        <AuthFooterAction
          eyebrow="Already have an account?"
          href="/login"
          label="Sign in instead"
        />
      </View>
    </MobileScreen>
  )
}
