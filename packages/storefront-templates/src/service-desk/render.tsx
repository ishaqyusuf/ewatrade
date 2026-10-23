import { StorefrontAttribution } from "@ewatrade/storefront-runtime/primitives"
import type { StorefrontClientSnapshot } from "@ewatrade/storefront-runtime/server"
import {
  CommerceCollection,
  TemplateActions,
  TemplateHost,
} from "../shared/commerce"
import { editorialTheme } from "../shared/theme"

/** Request journey is an offering directory plus the existing supported customer handoff. */
export function ServiceDesk({
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
        className="tf-store tf-desk"
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
              if (section.type === "service-intro")
                return (
                  <section className="tf-intro" key={section.id}>
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
                  </section>
                )
              if (section.type === "service-offerings")
                return (
                  <CommerceCollection
                    domain={domain}
                    key={section.id}
                    kind="services"
                    heading={String(section.settings.heading)}
                    requestHeading={String(section.settings["request-heading"])}
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
