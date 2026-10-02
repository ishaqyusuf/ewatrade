import {
  CATEGORY_SUGGESTION_CONFIG_KEY,
  DEFAULT_CATEGORY_SUGGESTION_CONFIGURATION,
} from "@ewatrade/utils/catalog-category-suggestions"
import { prisma } from "../src/client"

// Seed once. Re-running must preserve later master-admin choices, including OFF.
await prisma.systemConfiguration
  .upsert({
    where: { key: CATEGORY_SUGGESTION_CONFIG_KEY },
    create: {
      key: CATEGORY_SUGGESTION_CONFIG_KEY,
      value: DEFAULT_CATEGORY_SUGGESTION_CONFIGURATION,
    },
    update: {},
  })
  .finally(() => prisma.$disconnect())
console.info(
  "Category suggestion configuration seeded (existing choices preserved).",
)
