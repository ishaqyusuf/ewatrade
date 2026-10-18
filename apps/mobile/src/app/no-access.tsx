import { ClassicNoAccessScreen } from "@/components/mobile/green-till/no-access-screen"
import { useAuthContext } from "@/hooks/use-auth"
import { useTRPC } from "@/trpc/client"
import { useQuery } from "@tanstack/react-query"
import * as Clipboard from "expo-clipboard"
import { Redirect } from "expo-router"
import { useRouter } from "expo-router"

export default function NoAccessRoute() {
  const auth = useAuthContext()
  const router = useRouter()
  const trpc = useTRPC()
  const access = useQuery(
    trpc.auth.getMobileAccessProfile.queryOptions(undefined, {
      enabled: auth.isAuthenticated,
      retry: false,
    }),
  )
  if (access.data?.setupPending) return <Redirect href="/owner-setup" />
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
