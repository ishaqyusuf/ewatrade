import {
  AuthActionButton,
  AuthBrandHeader,
  AuthFooterAction,
  MobileScreen,
} from "@/components/mobile"
import { useAuthContext } from "@/hooks/use-auth"
import { useRouter } from "expo-router"

export default function NoAccessRoute() {
  const auth = useAuthContext()
  const router = useRouter()

  return (
    <MobileScreen contentClassName="justify-center gap-7">
      <AuthBrandHeader
        subtitle="This account does not currently have a Business membership or conversations explicitly linked to it."
        title="No workspace available yet"
      />
      <AuthActionButton onPress={() => router.replace("/")}>
        Check again
      </AuthActionButton>
      <AuthFooterAction
        eyebrow="Starting a business?"
        href="/sign-up"
        label="Create your business account"
      />
      <AuthActionButton onPress={auth.onLogout} variant="ghost">
        Sign out
      </AuthActionButton>
    </MobileScreen>
  )
}
