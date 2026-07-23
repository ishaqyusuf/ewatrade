import { ActionButton } from "@/components/mobile/action-button";
import { EmptyState } from "@/components/mobile/empty-state";
import { Text } from "@/components/ui/text";
import { View } from "@/components/ui/view";
import { formatMinorMoney } from "@ewatrade/utils";
import { ReferenceScreenShell } from "../../references/reference-screen-shell";
import {
  getDesign01Customer,
  getDesign01CustomerOrders,
  getDesign01CustomerValue,
} from "./design-01-commerce.data";
import {
  Design01InfoRow,
  Design01MetricTile,
  Design01OrderRow,
  Design01PageHeader,
  Design01Section,
  Design01StatusPill,
} from "./design-01-commerce-primitives";
import {
  DESIGN_01_CUSTOMERS_REFERENCE,
  DESIGN_01_ROUTES,
} from "./design-01.data";

export function Design01CustomerOverviewScreen({
  customerId,
}: {
  customerId: string;
}) {
  const customer = getDesign01Customer(customerId);

  if (!customer) {
    return (
      <ReferenceScreenShell
        hideFabsOnScroll
        secondaryAccessibilityLabel={`Open ${DESIGN_01_CUSTOMERS_REFERENCE.title}`}
        secondaryHref={DESIGN_01_CUSTOMERS_REFERENCE.route}
        secondaryIcon="Camera"
      >
        <Design01PageHeader
          backHref={DESIGN_01_ROUTES.customers}
          title="Customer overview"
        />
        <EmptyState
          icon="UserX"
          message="This sample customer is not part of the Design 01 preview data."
          title="Customer not found"
        />
        <ActionButton href={DESIGN_01_ROUTES.customers} variant="outline">
          Back to customers
        </ActionButton>
      </ReferenceScreenShell>
    );
  }

  const orders = getDesign01CustomerOrders(customer.id);
  const orderValue = getDesign01CustomerValue(customer.id);

  return (
    <ReferenceScreenShell
      hideFabsOnScroll
      secondaryAccessibilityLabel={`Open ${DESIGN_01_CUSTOMERS_REFERENCE.title}`}
      secondaryHref={DESIGN_01_CUSTOMERS_REFERENCE.route}
      secondaryIcon="Camera"
    >
      <View className="gap-6" testID="design-01-customer-overview-screen">
        <Design01PageHeader
          backHref={DESIGN_01_ROUTES.customers}
          title="Customer overview"
        />

        <View className="flex-row items-center gap-4">
          <View className="size-16 items-center justify-center rounded-full bg-primary">
            <Text className="text-lg font-extrabold text-primary-foreground">
              {customer.initials}
            </Text>
          </View>
          <View className="min-w-0 flex-1 gap-1">
            <View className="flex-row flex-wrap items-center gap-2">
              <Text className="text-2xl font-extrabold text-foreground">
                {customer.name}
              </Text>
              <Design01StatusPill
                label={customer.status}
                tone={customer.status === "Active" ? "success" : "muted"}
              />
            </View>
            <Text className="text-sm text-muted-foreground">
              {customer.location} · {customer.source}
            </Text>
          </View>
        </View>

        <View className="flex-row gap-3">
          <Design01MetricTile
            icon="Wallet"
            label="Order value"
            value={formatMinorMoney(orderValue, "NGN")}
          />
          <Design01MetricTile
            icon="ReceiptText"
            label="Total orders"
            value={String(orders.length)}
          />
        </View>

        <Design01Section title="Customer information">
          <Design01InfoRow
            detail={customer.address}
            icon="MapPin"
            title="Address"
          />
          <Design01InfoRow
            detail={`${customer.email}\n${customer.phone}`}
            icon="Mail"
            title="Contact"
          />
          <Design01InfoRow
            detail={customer.category}
            icon="LayoutGrid"
            title="Category"
          />
          <Design01InfoRow
            detail={customer.note}
            icon="StickyNote"
            title="Note"
          />
        </Design01Section>

        <View className="gap-2">
          <Text className="text-lg font-extrabold text-foreground">
            Recent orders
          </Text>
          <View className="rounded-2xl bg-card px-4">
            {orders.length ? (
              orders.map((order) => (
                <Design01OrderRow key={order.id} order={order} />
              ))
            ) : (
              <EmptyState
                icon="ReceiptText"
                message="Orders linked to this customer will appear here."
                title="No orders yet"
              />
            )}
          </View>
        </View>
      </View>
    </ReferenceScreenShell>
  );
}
