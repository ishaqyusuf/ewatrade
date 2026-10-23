import { defineTemplate } from "../../../storefront-contracts/src/manifest"

/**
 * Contract-only registration of accepted Catalog v4
 * (Workshop revision 8b1c41a2-3488-4aa9-9abf-3fb0799be0b2). Renderer: ./render.tsx
 * (`@ewatrade/storefront-templates/catalog-v4`); this file stays data-only for the registry.
 */
export const catalogV4LegacyManifest = defineTemplate({
  schemaVersion: 1,
  runtimeVersion: 1,
  key: "catalog-v4",
  version: "1.0.0",
  name: "Catalog",
  description:
    "Single-page catalog with categories, item detail and enquiry entrypoints.",
  businessTypes: ["retail", "services"],
  pages: [
    {
      key: "home",
      path: "/",
      label: "Home",
      allowedSections: ["catalog-header", "catalog", "contact"],
    },
  ],
  sections: [
    {
      key: "catalog-header",
      version: 1,
      label: "Header",
      allowedBlocks: [],
      resources: ["business"],
      capabilities: [],
      fields: [
        {
          key: "tagline",
          label: "Tagline",
          kind: "text",
          maxLength: 160,
          default: "",
        },
      ],
    },
    {
      key: "catalog",
      version: 1,
      label: "Catalog",
      allowedBlocks: [],
      resources: ["publicCatalog"],
      capabilities: ["catalog"],
      fields: [
        {
          key: "show-categories",
          label: "Show categories",
          kind: "boolean",
          default: true,
        },
      ],
    },
    {
      key: "contact",
      version: 1,
      label: "Contact",
      allowedBlocks: [],
      resources: ["business"],
      capabilities: ["conversation", "whatsappEnquiry", "serviceRequest"],
      fields: [],
    },
  ],
  blocks: [],
})

/** Optional decorative cover; legacy releases retain their exact 1.0 contract. */
export const catalogV4Manifest = defineTemplate({
  ...catalogV4LegacyManifest,
  version: "1.1.0",
  sections: catalogV4LegacyManifest.sections.map((section) =>
    section.key === "catalog-header"
      ? {
          ...section,
          version: 2,
          fields: [
            ...section.fields,
            {
              key: "cover",
              label: "Cover illustration",
              kind: "asset",
              default: null,
            },
          ],
        }
      : section,
  ),
})
