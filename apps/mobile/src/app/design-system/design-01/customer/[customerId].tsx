import { Design01CustomerOverviewScreen } from "@/components/mobile/design-system/designs/design-01";
import { useLocalSearchParams } from "expo-router";

export default function Design01CustomerOverviewRoute() {
  const { customerId } = useLocalSearchParams<{ customerId: string }>();

  return <Design01CustomerOverviewScreen customerId={customerId ?? ""} />;
}
