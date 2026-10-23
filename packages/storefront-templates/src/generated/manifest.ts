import { defineTemplate } from "../../../storefront-contracts/src/manifest"
import { retailEditorialManifest } from "../retail-editorial/manifest"
import { publicIntroManifest } from "./registry"

/** Opt-in local registration: preserves the selected Catalog v4 and all prior pins. */
export const componentEditorialManifest = defineTemplate({
  ...retailEditorialManifest,
  key: "component-editorial",
  version: "1.0.0",
  name: "Component editorial",
  description:
    "Reviewed public introduction with the existing editorial collection and customer actions.",
  pages: [
    {
      key: "home",
      path: "/",
      label: "Home",
      allowedSections: ["public-intro", "retail-collection", "contact"],
    },
  ],
  sections: [
    { ...publicIntroManifest.section, required: true, fixedFirst: true },
    ...retailEditorialManifest.sections.filter(
      (section) => section.key !== "retail-intro",
    ),
  ],
})
