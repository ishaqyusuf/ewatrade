import { CommercialOrderScreen } from "@/components/mobile/commercial-order-screen";
import { useLocalSearchParams } from "expo-router";

export default function CommercialOrderRoute() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  return <CommercialOrderScreen orderId={orderId ?? ""} />;
}
