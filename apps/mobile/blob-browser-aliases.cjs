const { dirname, resolve, relative, isAbsolute } = require("node:path")
const { readFileSync, existsSync } = require("node:fs")

/** Metro must resolve the SDK's browser map against its own package root. */
function createBlobBrowserResolver() {
  const root = dirname(dirname(require.resolve("@vercel/blob/client")))
  const { browser } = JSON.parse(
    readFileSync(resolve(root, "package.json"), "utf8"),
  )
  const aliases = new Map()
  for (const name of ["crypto", "stream", "undici"]) {
    const entry = browser?.[name]
    if (typeof entry !== "string") continue
    const filePath = resolve(root, entry)
    const child = relative(root, filePath)
    if (child.startsWith("..") || isAbsolute(child) || !existsSync(filePath))
      throw new Error(`Invalid Vercel Blob browser entry: ${name}`)
    aliases.set(name, filePath)
  }
  aliases.set("@vercel/oidc", resolve(__dirname, "blob-oidc-native.cjs"))
  return (moduleName, originModulePath) => {
    if (!originModulePath) return null
    const child = relative(root, originModulePath)
    if (child.startsWith("..") || isAbsolute(child)) return null
    const filePath = aliases.get(moduleName)
    return filePath ? { type: "sourceFile", filePath } : null
  }
}

module.exports = { createBlobBrowserResolver }
