import { AuthActionButton, AuthFooterAction } from "@/components/mobile"
import { AuthFlowScreen } from "@/components/mobile/green-till/auth-screen"
import { ClassicNoAccessScreen } from "@/components/mobile/green-till/no-access-screen"
import { useAuthContext } from "@/hooks/use-auth"
import { useMobileDesign } from "@/hooks/use-mobile-design"
import * as Clipboard from "expo-clipboard"
import { useRouter } from "expo-router"

export default function NoAccessRoute() {
  const auth = useAuthContext()
  const router = useRouter()
  const design = useMobileDesign("login")
  if (design === "classic")
    return (
      <ClassicNoAccessScreen
        email={auth.profile?.email}
        onStart={() => router.push("/sign-up")}
        onShareEmail={() => {
          if (auth.profile?.email)
            void Clipboard.setStringAsync(auth.profile.email)
        }}
        onPrivacy={() => router.push("/account-privacy")}
        onCheck={() => router.replace("/")}
        onSignOut={auth.onLogout}
      />
    )

  return (
    <AuthFlowScreen
      appearanceScreen="login"
      eyebrow={
        auth.profile?.email
          ? `Signed in as ${auth.profile.email}`
          : "Your account"
      }
      title="No business on this account yet"
      subtitle="Start your own business, or ask your employer to invite this email."
    >
      <AuthActionButton onPress={() => router.replace("/")}>
        Check again
      </AuthActionButton>
      <AuthFooterAction
        eyebrow="Starting a business?"
        href="/sign-up"
        label="Create your business account"
      />
      <AuthActionButton
        onPress={() => router.push("/account-privacy")}
        variant="ghost"
      >
        Account, privacy and deletion
      </AuthActionButton>
      <AuthActionButton onPress={auth.onLogout} variant="ghost">
        Sign out
      </AuthActionButton>
    </AuthFlowScreen>
  )
}
