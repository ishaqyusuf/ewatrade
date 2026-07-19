import { prisma } from "../src/client"

const systemUnitDefinitions = [
  { name: "Piece", scopeKey: "system:piece", sortOrder: 10, symbol: "pc" },
  { name: "Pack", scopeKey: "system:pack", sortOrder: 20, symbol: "pack" },
  { name: "Carton", scopeKey: "system:carton", sortOrder: 30, symbol: "ctn" },
  { name: "Kilogram", scopeKey: "system:kilogram", sortOrder: 40, symbol: "kg" },
  { name: "Gram", scopeKey: "system:gram", sortOrder: 50, symbol: "g" },
  { name: "Litre", scopeKey: "system:litre", sortOrder: 60, symbol: "L" },
  { name: "Millilitre", scopeKey: "system:millilitre", sortOrder: 70, symbol: "mL" },
  { name: "Metre", scopeKey: "system:metre", sortOrder: 80, symbol: "m" },
  { name: "Centimetre", scopeKey: "system:centimetre", sortOrder: 90, symbol: "cm" },
] as const

async function main() {
  for (const definition of systemUnitDefinitions) {
    await prisma.unitDefinition.upsert({
      where: { scopeKey: definition.scopeKey },
      create: {
        ...definition,
        isActive: true,
        isSystem: true,
      },
      update: {
        name: definition.name,
        symbol: definition.symbol,
        sortOrder: definition.sortOrder,
        isActive: true,
        isSystem: true,
      },
    })
  }
}

await main().finally(() => prisma.$disconnect())
