import { FormField } from "@/components/mobile/form-field";
import { View } from "@/components/ui/view";
import { useMemo, useState } from "react";
import { DESIGN_01_CUSTOMERS } from "./design-01-commerce.data";
import {
  Design01CommerceListShell,
  Design01CustomerRow,
  Design01FilterChip,
  Design01PageHeader,
} from "./design-01-commerce-primitives";
import {
  DESIGN_01_CUSTOMERS_REFERENCE,
  DESIGN_01_ROUTES,
} from "./design-01.data";

type CustomerStatusFilter = "All" | "Active" | "Inactive";

export function Design01CustomersScreen() {
  const [location, setLocation] = useState("All");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<CustomerStatusFilter>("All");
  const visibleCustomers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return DESIGN_01_CUSTOMERS.filter((customer) => {
      const matchesStatus = status === "All" || customer.status === status;
      const matchesLocation =
        location === "All" || customer.location === location;
      const matchesQuery =
        !normalizedQuery ||
        `${customer.name} ${customer.phone} ${customer.email} ${customer.location}`
          .toLowerCase()
          .includes(normalizedQuery);
      return matchesStatus && matchesLocation && matchesQuery;
    });
  }, [location, query, status]);

  return (
    <Design01CommerceListShell
      data={visibleCustomers}
      emptyMessage="Try another customer name, status, or location."
      emptyTitle="No matching customers"
      header={
        <View className="gap-5 pb-4">
          <Design01PageHeader
            backHref={DESIGN_01_ROUTES.orders}
            subtitle="Customer identity and order activity in one compact list."
            title="Customers"
          />
          <FormField
            autoCapitalize="none"
            label="Search"
            leadingIcon="Search"
            onChangeText={setQuery}
            placeholder="Search name, phone, or email"
            value={query}
          />
          <View className="flex-row flex-wrap gap-2">
            {(["All", "Active", "Inactive"] as const).map((value) => (
              <Design01FilterChip
                active={status === value}
                key={value}
                label={value}
                onPress={() => setStatus(value)}
              />
            ))}
          </View>
          <View className="flex-row flex-wrap gap-2">
            {["All", "Lagos", "Abuja", "Uyo"].map((value) => (
              <Design01FilterChip
                active={location === value}
                key={value}
                label={value === "All" ? "All locations" : value}
                onPress={() => setLocation(value)}
              />
            ))}
          </View>
        </View>
      }
      keyExtractor={(customer) => customer.id}
      reference={DESIGN_01_CUSTOMERS_REFERENCE}
      renderItem={({ item }) => <Design01CustomerRow customer={item} />}
      testID="design-01-customers-screen"
    />
  );
}
