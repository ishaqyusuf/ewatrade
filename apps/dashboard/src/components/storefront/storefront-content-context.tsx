"use client"

import type { StorefrontContentContext } from "@ewatrade/storefront-contracts/content"
import type { StorefrontComposition } from "@ewatrade/storefront-contracts/manifest"
import {
  getStorefrontContentProfile,
  getTemplateManifest,
  listSelectableTemplates,
} from "@ewatrade/storefront-templates"
import {
  Button,
  ControlField,
  Input,
  FieldLabel as Label,
  SelectControl,
  Textarea,
} from "@ewatrade/ui"
import { useId, useState } from "react"
import type { UseFormReturn } from "react-hook-form"

export function StorefrontContentContextForm({
  form,
  onDone,
}: { form: UseFormReturn<StorefrontContentContext>; onDone: () => void }) {
  return (
    <form className="sf-content-stack" onSubmit={form.handleSubmit(onDone)}>
      <h3>The facts behind your draft</h3>
      <div className="sf-content-notice">
        <strong>Business profile + catalog</strong>
        <p>
          These facts come from your business and public catalog. Changes here
          are used for this draft only. Update your business profile separately.
        </p>
      </div>
      {(
        [
          ["name", "Business name", false, 240],
          ["location", "Location (optional)", false, 240],
          ["description", "What the business does", true, 2000],
          ["offerings", "Products and services to mention", true, 2000],
        ] as const
      ).map(([name, label, multiline, maxLength]) => (
        <ControlField
          key={name}
          label={label}
          error={form.formState.errors[name]?.message}
          description={
            name === "location"
              ? "Leave this blank when a location is not part of the public profile."
              : undefined
          }
        >
          {multiline ? (
            <Textarea {...form.register(name)} rows={3} maxLength={maxLength} />
          ) : (
            <Input {...form.register(name)} maxLength={maxLength} />
          )}
        </ControlField>
      ))}
      <div className="sf-content-notice">
        <strong>Only supplied facts</strong>
        <p>
          No invented testimonials, ratings, guarantees, prices, stock or
          delivery promises. Writing instructions do not change your business
          settings.
        </p>
      </div>
      <Button type="submit" variant="outline" className="self-start">
        Use this context
      </Button>
    </form>
  )
}

export function StorefrontContentGuidance({
  composition,
}: { composition: StorefrontComposition }) {
  const profileId = useId()
  const current = getTemplateManifest(composition)
  const manifests = [
    current,
    ...listSelectableTemplates().map((entry) => entry.manifest),
  ].filter(
    (entry, index, all) =>
      all.findIndex(
        (other) => other.key === entry.key && other.version === entry.version,
      ) === index,
  )
  const [pin, setPin] = useState(`${current.key}@${current.version}`)
  const manifest =
    manifests.find((entry) => `${entry.key}@${entry.version}` === pin) ??
    current
  const profile = getStorefrontContentProfile(manifest)
  const areas =
    profile?.areas.filter((area) => {
      const section = manifest.sections.find(
        (entry) => entry.key === area.sectionType,
      )
      return !section?.source || section.source.templateKey === manifest.key
    }) ?? []
  return (
    <div className="sf-content-stack">
      <h3>Writing guidance, built into the template</h3>
      <div className="sf-content-field">
        <Label htmlFor={profileId}>Inspect a template profile</Label>
        <SelectControl
          id={profileId}
          aria-label="Inspect a template profile"
          value={`${manifest.key}@${manifest.version}`}
          onValueChange={setPin}
          options={manifests.map((entry) => ({
            value: `${entry.key}@${entry.version}`,
            label: `${entry.name} · ${entry.version}`,
          }))}
        />
      </div>
      {profile ? (
        <>
          <section className="sf-content-profile">
            <div className="sf-content-between">
              <strong>{profile.name}</strong>
              <span className="sf-content-badge">
                Guidance v{profile.version} · Template{" "}
                {profile.template.version}
              </span>
            </div>
            <p>{profile.description}</p>
            <h4>Voice</h4>
            <p>{profile.voice}</p>
          </section>
          <div className="sf-content-guidance">
            {areas.map((area) => (
              <section
                key={`${area.sectionType}:${area.blockType}:${area.key}`}
              >
                <div className="sf-content-between">
                  <strong>
                    {
                      manifest.sections.find(
                        (entry) => entry.key === area.sectionType,
                      )?.label
                    }{" "}
                    / {area.label}
                  </strong>
                  <span>
                    {area.generation === "manual"
                      ? "Manual only"
                      : `${area.minWords}–${area.maxWords} words`}
                  </span>
                </div>
                <p>{area.purpose}</p>
                <small>Hard maximum: {area.maxLength} characters</small>
              </section>
            ))}
          </div>
        </>
      ) : (
        <p>
          This template does not offer AI writing guidance. You can edit its
          text directly.
        </p>
      )}
      <div className="sf-content-notice">
        <strong>Guidance follows each section</strong>
        <p>
          Inserted sections use their original template and version. Inspecting
          another profile changes neither your template nor generation settings.
        </p>
      </div>
      <p className="sf-content-hint">
        Word ranges guide the draft. Hard field limits still apply. Profiles are
        built into templates; no prompt or provider setup is needed here.
      </p>
    </div>
  )
}
