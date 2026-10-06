// Native packages the single-file API bundle loads from node_modules at runtime
// instead of inlining. Their binaries can't live in one bundle file, and the
// code that loads them must resolve its platform package from its real install
// path. apps/api lists them as direct dependencies so they resolve from the
// bundle's location under Bun's isolated installs.
// - @napi-rs/canvas: receipt images import it lazily (only that feature needs it).
// - sharp: catalog photo processing.
export const API_BUNDLE_EXTERNALS = Object.freeze(["@napi-rs/canvas", "sharp"])

export function apiBundleExternalArgs() {
  return API_BUNDLE_EXTERNALS.map((name) => `--external=${name}`)
}
