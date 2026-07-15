import { DESIGN_01_ROUTES } from "@/components/mobile/design-system/designs/design-01"
import { Redirect } from "expo-router"

export default function DesignSystemReferenceImageRoute() {
  return <Redirect href={DESIGN_01_ROUTES.image} />
}
