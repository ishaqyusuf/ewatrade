type OrderItemLine = {
  quantity: string
  snapshot: {
    catalogItemName: string
    variantName: string
    inventoryUnitName?: string | null
  } | null
}

function sameLabel(left: string, right: string) {
  const a = left.toLowerCase()
  const b = right.toLowerCase()
  return a === b || a === `${b}s` || b === `${a}s`
}

export function formatOrderItemGroups(lines: OrderItemLine[]) {
  const groups = new Map<string, { name: string; details: string[] }>()

  for (const line of lines) {
    const name = line.snapshot?.catalogItemName.trim() || "Item"
    const variant = line.snapshot?.variantName.trim() || ""
    const unit = line.snapshot?.inventoryUnitName?.trim() || ""
    const labels = []

    if (
      variant &&
      variant.toLowerCase() !== "default" &&
      !sameLabel(variant, name)
    ) {
      labels.push(variant)
    }
    if (
      unit &&
      !sameLabel(unit, name) &&
      !labels.some((label) => sameLabel(label, unit))
    ) {
      labels.push(unit)
    }

    const detail = labels.length
      ? `${line.quantity} × ${labels.join(" · ")}`
      : line.quantity
    const key = name.toLowerCase()
    const group = groups.get(key) ?? { name, details: [] }
    group.details.push(detail)
    groups.set(key, group)
  }

  return Array.from(groups.values(), (group) => ({
    name: group.name,
    details: group.details.join(", "),
  }))
}
