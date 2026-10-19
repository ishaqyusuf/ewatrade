import type { GeneralAnswer } from "@ewatrade/assistant/general/contracts"
import { useRouter } from "expo-router"
import { NativeStaffDirectoryScreen } from "./native-staff-directory-screen"
import { NativeStaffHistoryScreen } from "./native-staff-history-screen"
import { NativeStaffMemberScreen } from "./native-staff-member-screen"
import {
  type NativeStaffReadTarget,
  nativeStaffReadRoute,
} from "./native-staff-read-target"
import { nativeStaffOriginalRoute } from "./native-staff-target"

/** Replace this read's target without adding a stack entry over the saved chat. */
export function NativeStaffReadScreen({
  target,
}: { target: NativeStaffReadTarget }) {
  const router = useRouter()
  const onOpen = (next: GeneralAnswer["target"]) => {
    const route = nativeStaffReadRoute(next) ?? nativeStaffOriginalRoute(next)
    if (route) router.setParams(route.params)
  }
  if (target.kind === "staff_member")
    return (
      <NativeStaffMemberScreen
        key={JSON.stringify(target)}
        target={target}
        onOpen={onOpen}
      />
    )
  if (target.kind === "staff_history")
    return (
      <NativeStaffHistoryScreen
        key={JSON.stringify(target)}
        target={target}
        onOpen={onOpen}
      />
    )
  return (
    <NativeStaffDirectoryScreen
      key={JSON.stringify(target)}
      target={target}
      onOpen={onOpen}
    />
  )
}
