import { storefrontDesignAsset } from "@ewatrade/storefront-runtime/design-assets"
import { StorefrontAttribution } from "@ewatrade/storefront-runtime/primitives"
import type { StorefrontClientSnapshot } from "@ewatrade/storefront-runtime/server"
import { ReviewedIntroduction } from "../generated/public-intro/host"
import {
  CommerceCollection,
  TemplateActions,
  TemplateHost,
} from "../shared/commerce"
import { editorialTheme } from "../shared/theme"

/** Template-owned server markup. Shared islands own browsing and customer navigation. */
export function RetailEditorial({
  snapshot,
  domain,
  after,
  customerChatOrigin,
  onTaglineChange,
  draftPreview,
}: {
  snapshot: StorefrontClientSnapshot
  draftPreview?: boolean
  domain: string
  after?: string
  customerChatOrigin: string
  onTaglineChange?: (value: string) => void
}) {
  const { business } = snapshot.resources
  const sections =
    snapshot.composition.pages[0]?.sections.filter(
      (section) => section.visible,
    ) ?? []
  return (
    <TemplateHost snapshot={snapshot}>
      <div
        className="tf-store tf-retail"
        style={editorialTheme(snapshot.composition)}
      >
        {snapshot.mode === "preview" ? (
          <p className="tf-preview">
            {draftPreview ? "Private draft preview" : "Local QA preview"} ·
            customer actions do not send anything
          </p>
        ) : null}
        <div className="tf-wrap">
          <header className="tf-header">
            <span className="tf-brand">{business.name}</span>
            <TemplateActions domain={domain} />
          </header>
          <main>
            {sections.map((section) => {
              if (section.type === "public-intro")
                return (
                  <ReviewedIntroduction
                    key={section.id}
                    snapshot={snapshot}
                    settings={section.settings}
                  />
                )
              if (section.type === "retail-intro") {
                const cover = storefrontDesignAsset(section.settings.cover)
                return (
                  <section
                    className={`tf-intro${cover ? " tf-split" : ""}`}
                    key={section.id}
                  >
                    <div>
                      <p className="tf-eyebrow">{business.name}</p>
                      <h1>{section.settings.headline || business.name}</h1>
                      <p
                        className="tf-lede"
                        contentEditable={
                          onTaglineChange ? "plaintext-only" : undefined
                        }
                        suppressContentEditableWarning={!!onTaglineChange}
                        aria-label={
                          onTaglineChange
                            ? "Edit storefront description"
                            : undefined
                        }
                        onBlur={
                          onTaglineChange
                            ? (event) =>
                                onTaglineChange(
                                  event.currentTarget.textContent ?? "",
                                )
                            : undefined
                        }
                      >
                        {section.settings.tagline || business.description}
                      </p>
                      <a className="tf-primary" href="#collection">
                        Explore the collection ↓
                      </a>
                    </div>
                    {cover ? (
                      <img
                        className="tf-cover"
                        src={cover.url}
                        alt=""
                        width={1200}
                        height={560}
                      />
                    ) : null}
                  </section>
                )
              }
              if (section.type === "retail-collection")
                return (
                  <CommerceCollection
                    domain={domain}
                    key={section.id}
                    kind="retail"
                    heading={String(section.settings.heading)}
                    showCategories={
                      section.settings["show-categories"] === true
                    }
                    after={after}
                    customerChatOrigin={customerChatOrigin}
                  />
                )
              return section.type === "contact" ? (
                <section className="tf-contact" key={section.id}>
                  <strong>{business.name}</strong>
                  <span>{domain}</span>
                </section>
              ) : null
            })}
          </main>
          <footer className="tf-footer">
            <StorefrontAttribution />
          </footer>
        </div>
      </div>
    </TemplateHost>
  )
}
