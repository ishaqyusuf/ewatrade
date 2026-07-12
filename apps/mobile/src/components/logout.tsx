import { Pressable } from "@/components/ui/pressable"
import { useAuthContext } from "@/hooks/use-auth"
import { useColors } from "@/hooks/use-color"
import { LogOut } from "lucide-react-native"

export function Logout() {
  const colors = useColors()
  const auth = useAuthContext()

  return (
    <Pressable
      className="rounded-full p-2.5 active:bg-muted"
      haptic
      onPress={() => {
        auth.signOutLocal()
      }}
      transition
    >
      <LogOut size={20} color={colors.foreground} />
    </Pressable>
  )
}
