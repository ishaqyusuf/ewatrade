import { Design01OrderOverviewScreen } from "@/components/mobile/design-system/designs/design-01";
import { useLocalSearchParams } from "expo-router";

export default function Design01OrderOverviewRoute() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();

  return <Design01OrderOverviewScreen orderId={orderId ?? ""} />;
}
