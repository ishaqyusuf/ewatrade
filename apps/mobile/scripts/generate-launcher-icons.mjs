// Use the same outlined masters and environment patterns as the app's brand assets.
// BRAND_SHARP_MODULE may point to an available Sharp module for asset authoring.
process.argv.push("--mobile-only")
await import(
  "../../../artifacts/brand-identity/precision-rise/render-assets.mjs"
)
