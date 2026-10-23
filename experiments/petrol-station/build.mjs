// Dependency-free build: inlines CSS and the ES modules into one standalone
// index.html, and writes dev.html that loads the editable modules directly.
//
//   node experiments/petrol-station/build.mjs
//
// The bundler handles the subset these sources use: named `import { … } from`
// statements and `export function|const|let|class` declarations.

import { readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const MODULES = ["model.mjs", "src/scene.mjs", "src/plates.mjs", "src/lessons.mjs"]; // dependency order
const STYLES = ["src/lessons.css", "src/scene.css"];
const TEMPLATE = "src/lessons.html";
const ENTRY = "src/lessons.mjs";

const moduleName = (path) => basename(path).replace(/\.mjs$/, "");

function transform(source, file) {
  const exports = [];
  let code = source.replace(/^import\s*\{([^}]*)\}\s*from\s*["']([^"']+)["'];?/gm, (_, names, spec) => {
    const bindings = names
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean)
      .map((n) => n.replace(/\s+as\s+/, ": "))
      .join(", ");
    return `const { ${bindings} } = __modules[${JSON.stringify(moduleName(spec))}];`;
  });
  code = code.replace(/^export\s+((?:async\s+)?(?:function\*?|const|let|class)\s+([A-Za-z_$][\w$]*))/gm, (_, decl, name) => {
    exports.push(name);
    return decl;
  });
  if (/^\s*(import|export)\b/m.test(code)) throw new Error(`${file}: unsupported import/export form`);
  return `__modules[${JSON.stringify(moduleName(file))}] = (() => {\n${code}\nreturn { ${exports.join(", ")} };\n})();`;
}

async function main() {
  const template = await readFile(join(root, TEMPLATE), "utf8");
  let css = "";
  for (const file of STYLES) css += `${await readFile(join(root, file), "utf8")}\n`;
  const parts = [];
  for (const file of MODULES) parts.push(transform(await readFile(join(root, file), "utf8"), file));
  const script = `(() => {\n"use strict";\nconst __modules = {};\n${parts.join("\n\n")}\n})();`;
  if (/<\/script/i.test(script) || /<\/style/i.test(css)) throw new Error("closing tag inside inlined source");
  new Function(script); // syntax check of the bundle (compiles, does not run)

  const banner = "<!-- Built by build.mjs from model.mjs and src/. Edit those files, then rebuild. -->";
  const html = template
    .replace("<!--STYLE-->", () => `${banner}\n<style>\n${css}</style>`)
    .replace("<!--SCRIPT-->", () => `<script>\n${script}\n</script>`);
  const dev = template
    .replace("<!--STYLE-->", STYLES.map((f) => `<link rel="stylesheet" href="${f}">`).join("\n"))
    .replace("<!--SCRIPT-->", `<script type="module" src="${ENTRY}"></script>`);

  // Standalone guarantee: no external resources in the bundled page. Source
  // URLs may appear as visible text, but never in attributes, CSS or script.
  // Plain <a href> source links are allowed: they load nothing unless clicked.
  const external = html.match(/<(?!a\s)[a-z]+\b[^>]*\b(?:src|href)\s*=\s*["'](?!#)[^"']+["']|@import|url\(\s*["']?https?:|fetch\(|XMLHttpRequest|WebSocket/gi);
  if (external) throw new Error(`external reference in index.html: ${external.join(", ")}`);
  const urls = (`${css}\n${script}`.match(/https?:\/\/[^\s"'<>)`]+/g) ?? []).filter((u) => u !== "http://www.w3.org/2000/svg");
  if (urls.length) throw new Error(`unexpected URL in CSS/script: ${urls.join(", ")}`);

  await writeFile(join(root, "index.html"), html);
  await writeFile(join(root, "dev.html"), dev);
  console.log(`index.html ${(Buffer.byteLength(html) / 1024).toFixed(1)} KiB (standalone) · dev.html (module sources)`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
