import {
  ActionButton,
  AuthHeader,
  AuthMethodButton,
  FormField,
  MobileScreen,
  StatusBanner,
} from "@/components/mobile"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
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
      contentClassName="justify-center gap-8"
      keyboardBottomOffset={420}
    >
      <AuthHeader
        badge="New business"
        icon="Building2"
        subtitle="Start with only the details needed to create your retail workspace."
        title="Create your account"
      />

      <View className="gap-3">
        <FormField
          helper="This is the business customers and attendants will see."
          label="Business name"
          onChangeText={setBusinessName}
          placeholder="Enter your business name"
          value={businessName}
        />
        <AuthMethodButton
          disabled={googleAuth.isPending || !canContinueWithGoogle}
          icon="Globe"
          label="Sign up with Google"
          loadingLabel="Connecting to Google"
          onPress={continueWithGoogle}
          pending={googleAuth.isPending}
          tone="primary"
        />
        <View className="flex-row items-center gap-3">
          <View className="h-px flex-1 bg-border" />
          <Text className="text-xs font-semibold uppercase text-muted-foreground">
            or
          </Text>
          <View className="h-px flex-1 bg-border" />
        </View>
      </View>

      <View className="gap-4">
        <FormField
          label="Your name"
          onChangeText={setName}
          placeholder="Enter your full name"
          textContentType="name"
          value={name}
        />
        <FormField
          autoCapitalize="none"
          keyboardType="email-address"
          label="Email address"
          onChangeText={setEmail}
          placeholder="Enter your email address"
          textContentType="emailAddress"
          value={email}
        />
      </View>

      <View className="gap-4">
        <ActionButton
          disabled={!canContinueWithEmail}
          onPress={continueWithEmail}
        >
          {requestOtpMutation.isPending
            ? "Sending code"
            : "Send verification code"}
        </ActionButton>
        {error ? (
          <StatusBanner
            icon="TriangleAlert"
            message={error}
            title="Sign-up needs attention"
            tone="destructive"
          />
        ) : null}
        <Pressable className="items-center" haptic href="/login" transition>
          <Text className="text-sm font-semibold text-muted-foreground">
            I already have an account
          </Text>
        </Pressable>
      </View>
    </MobileScreen>
  )
}
