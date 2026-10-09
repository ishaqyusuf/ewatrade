import { describe, expect, test } from "bun:test"
import { recommendCatalogIllustration } from "./catalog-illustrations"

const pick = (
  name: string,
  kind: "product" | "service" = "product",
  businessProfileKey?: string,
) =>
  recommendCatalogIllustration({ name, kind, businessProfileKey })?.id ?? null

describe("recommended illustration for an item name", () => {
  test("matches the thing itself, in plural or with packaging words", () => {
    expect(pick("Crate of eggs")).toBe("ill-egg")
    expect(pick("Egg trays")).toBe("ill-egg-tray")
    expect(pick("Broiler chicken")).toBe("ill-chicken")
    expect(pick("Layer feed")).toBe("ill-grain-feed-sack")
    expect(pick("Tomatoes")).toBe("ill-tomato")
    expect(pick("Ankara fabric")).toBe("ill-fabric-roll")
    expect(pick("Cooking oil, 5 litres")).toBe("ill-cooking-oil")
  })

  test("services only get service illustrations", () => {
    expect(pick("Shirt wash", "service")).toBe("ill-shirt")
    expect(pick("Ironing", "service")).toBe("ill-iron")
    expect(pick("Phone screen repair", "service")).toBe("ill-phone-screen")
    expect(pick("Meat pie", "service")).toBeNull()
  })

  test("packaging alone or an unknown item picks nothing", () => {
    expect(pick("Bag of rice")).toBeNull()
    expect(pick("Indomie noodles")).toBeNull()
    expect(pick("Senator material")).toBeNull()
    expect(pick("")).toBeNull()
  })
})
