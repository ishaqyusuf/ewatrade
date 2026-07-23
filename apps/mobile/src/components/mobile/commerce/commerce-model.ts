import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app";
import { formatMinorMoney } from "@ewatrade/utils";
import type { LinkProps } from "expo-router";

export type CommercialOrder = RouterOutputs["orders"]["list"][number];
export type CommercialOrderLine = CommercialOrder["lines"][number];
export type CommerceStatusTone =
  "destructive" | "muted" | "primary" | "success" | "warning";

export type PendingCommerceOrder = {
  clientCommandId: string;
  createdAtClient: Date;
  customerEmail?: string;
  customerName?: string;
  customerPhone?: string;
  lineCount: number;
};

export type CommerceCustomer = {
  currencyTotals: Array<{ currencyCode: string; totalMinor: number }>;
  email: string | null;
  id: string;
  initials: string;
  name: string;
  orders: CommercialOrder[];
  pendingOrders: PendingCommerceOrder[];
  phone: string | null;
};

export function commercialOrderHref(orderId: string) {
  return `/order/${encodeURIComponent(orderId)}` as LinkProps["href"];
}

export function commerceStatusLabel(status: string) {
  return status
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function commerceOrderTone(status: string): CommerceStatusTone {
  if (status === "COMPLETED") return "success";
  if (["CANCELLED", "REFUNDED"].includes(status)) return "destructive";
  if (["DRAFT", "PENDING"].includes(status)) return "muted";
  return "primary";
}

export function commercePaymentTone(status: string): CommerceStatusTone {
  if (status === "PAID") return "success";
  if (["FAILED", "REFUNDED"].includes(status)) return "destructive";
  if (status === "PARTIALLY_PAID") return "warning";
  if (status === "AUTHORIZED") return "primary";
  return "warning";
}

export function formatCommerceDate(value: Date | string) {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function formatCommerceDateTime(value: Date | string) {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function commerceLineTitle(line: CommercialOrderLine) {
  return line.snapshot?.catalogItemName ?? "Archived item";
}

export function commerceLineOption(line: CommercialOrderLine) {
  const labels = [
    line.snapshot?.variantName,
    line.snapshot?.inventoryUnitName,
    line.snapshot?.offeringName,
  ].filter((value, index, values) => value && values.indexOf(value) === index);
  return (
    labels.join(" · ") || (line.kind === "service" ? "Service" : "Product")
  );
}

export function commerceOrderItemCount(order: CommercialOrder) {
  return order.lines.reduce((total, line) => total + Number(line.quantity), 0);
}

export function formatCommerceQuantity(value: number | string) {
  const quantity = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(quantity)) return String(value);
  return quantity.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

export function commerceCustomerIdentity(input: {
  customerEmail?: null | string;
  customerName?: null | string;
  customerPhone?: null | string;
}) {
  const email = input.customerEmail?.trim().toLowerCase();
  if (email) return `email:${email}`;
  const phone = input.customerPhone?.replace(/[^\d+]/g, "");
  if (phone) return `phone:${phone}`;
  const name = input.customerName?.trim().toLowerCase();
  return name ? `name:${name}` : null;
}

function customerInitials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("") || "CU"
  );
}

export function buildCommerceCustomers(
  orders: CommercialOrder[],
  pendingOrders: PendingCommerceOrder[] = [],
) {
  const grouped = new Map<
    string,
    {
      email: string | null;
      name: string;
      orders: CommercialOrder[];
      pendingOrders: PendingCommerceOrder[];
      phone: string | null;
    }
  >();

  for (const order of orders) {
    const key = commerceCustomerIdentity(order);
    if (!key) continue;
    const current = grouped.get(key);
    grouped.set(key, {
      email: current?.email ?? order.customerEmail,
      name:
        current?.name ??
        order.customerName ??
        order.customerPhone ??
        order.customerEmail ??
        "Customer",
      orders: [...(current?.orders ?? []), order],
      pendingOrders: current?.pendingOrders ?? [],
      phone: current?.phone ?? order.customerPhone,
    });
  }

  for (const order of pendingOrders) {
    const key = commerceCustomerIdentity(order);
    if (!key) continue;
    const current = grouped.get(key);
    grouped.set(key, {
      email: current?.email ?? order.customerEmail ?? null,
      name:
        current?.name ??
        order.customerName ??
        order.customerPhone ??
        order.customerEmail ??
        "Customer",
      orders: current?.orders ?? [],
      pendingOrders: [...(current?.pendingOrders ?? []), order],
      phone: current?.phone ?? order.customerPhone ?? null,
    });
  }

  return [...grouped.entries()]
    .map(([key, customer]): CommerceCustomer => {
      const sortedOrders = [...customer.orders].sort(
        (left, right) =>
          new Date(right.createdAt).getTime() -
          new Date(left.createdAt).getTime(),
      );
      const sortedPending = [...customer.pendingOrders].sort(
        (left, right) =>
          right.createdAtClient.getTime() - left.createdAtClient.getTime(),
      );
      const currencyTotals = new Map<string, number>();
      for (const order of sortedOrders) {
        currencyTotals.set(
          order.currencyCode,
          (currencyTotals.get(order.currencyCode) ?? 0) + order.totalMinor,
        );
      }
      return {
        currencyTotals: [...currencyTotals.entries()].map(
          ([currencyCode, totalMinor]) => ({ currencyCode, totalMinor }),
        ),
        email: customer.email,
        id: key,
        initials: customerInitials(customer.name),
        name: customer.name,
        orders: sortedOrders,
        pendingOrders: sortedPending,
        phone: customer.phone,
      };
    })
    .sort((left, right) => {
      const leftDate =
        left.orders[0]?.createdAt ?? left.pendingOrders[0]?.createdAtClient;
      const rightDate =
        right.orders[0]?.createdAt ?? right.pendingOrders[0]?.createdAtClient;
      return (
        new Date(rightDate ?? 0).getTime() - new Date(leftDate ?? 0).getTime()
      );
    });
}

export function customerOrderCount(customer: CommerceCustomer) {
  return customer.orders.length + customer.pendingOrders.length;
}

export function customerValueLabel(customer: CommerceCustomer) {
  if (customer.currencyTotals.length === 0) return "Pending sync";
  if (customer.currencyTotals.length > 1) {
    return `${customer.currencyTotals.length} currencies`;
  }
  const [total] = customer.currencyTotals;
  return total
    ? formatMinorMoney(total.totalMinor, total.currencyCode)
    : formatMinorMoney(0, "NGN");
}

export function findCustomerByOrderId(
  customers: CommerceCustomer[],
  orderId: string | null | undefined,
) {
  if (!orderId) return null;
  return (
    customers.find((customer) =>
      customer.orders.some((order) => order.id === orderId),
    ) ?? null
  );
}
