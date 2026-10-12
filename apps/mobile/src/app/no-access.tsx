import { ClassicNoAccessScreen } from "@/components/mobile/green-till/no-access-screen"
import { useAuthContext } from "@/hooks/use-auth"
import * as Clipboard from "expo-clipboard"
import { useRouter } from "expo-router"

export default function NoAccessRoute() {
  const auth = useAuthContext()
  const router = useRouter()
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
}
