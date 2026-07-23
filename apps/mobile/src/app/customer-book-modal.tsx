import { CustomerBookContent, WorkflowModalScreen } from "@/components/mobile";
import { useLocalSearchParams } from "expo-router";

export default function CustomerBookModalRoute() {
  const { customerOrderId } = useLocalSearchParams<{
    customerOrderId?: string;
  }>();

  return (
    <WorkflowModalScreen
      allowSalesRep
      closeLabel="Close customer book"
      title="Customers"
    >
      <CustomerBookContent initialOrderId={customerOrderId} />
    </WorkflowModalScreen>
  );
}
