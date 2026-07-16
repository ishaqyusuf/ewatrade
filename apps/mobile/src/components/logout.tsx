import { Pressable } from "@/components/ui/pressable"
import { useAuthContext } from "@/hooks/use-auth"
import { useColors } from "@/hooks/use-color"
import { LogOut } from "lucide-react-native"

type LogoutProps = {
  tone?: "default" | "hero"
}

export function Logout({ tone = "default" }: LogoutProps) {
  const colors = useColors()
  const auth = useAuthContext()
  const isHero = tone === "hero"

  return (
    <Pressable
      className={
        isHero
          ? "rounded-full p-2.5 active:opacity-85"
          : "rounded-full p-2.5 active:bg-muted"
      }
      haptic
      onPress={() => {
        auth.signOutLocal()
      }}
      transition
    >
      <LogOut
        size={20}
        color={isHero ? colors.primaryForeground : colors.foreground}
      />
    </Pressable>
  )
}
