import { fileURLToPath } from "node:url"
const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url))
export async function buildMenuPrefetchFixture(
  mode: "production" | "development",
) {
  const ports: Record<string, string> = {
    scheduler: `
      export function schedulePrefetchTask(key,root,strategy,priority) {
        const task={pathname:key.pathname,search:key.search,strategy,priority,cancelled:false};
        window.__menuProbe.tasks.push(task);return task;
      }
      export function cancelPrefetchTask(task){task.cancelled=true}
      export function reschedulePrefetchTask(task,root,strategy,priority){task.strategy=strategy;task.priority=priority;task.cancelled=false}
      export function isPrefetchTaskDirty(){return false}
    `,
    router: `
      export function getCurrentAppRouterState(){return {nextUrl:'/catalog',root:{}}}
      export function navigate(href,type,scroll,instance,transitionTypes,intent){window.__menuProbe.navigations.push({href,type,scroll,intent})}
    `,
    navigation: `export function usePathname(){return '/catalog'}`,
    utils: `export const cn=(...values)=>values.filter(Boolean).join(' ')`,
    icons: "export const ArrowDown01Icon=[]",
    icon: "export function HugeiconsIcon(){return null}",
    navIcon: "export function NavIcon(){return null}",
    flight: `export function fetchServerResponse(){throw Error('No live Flight requests permitted')}`,
  }
  const result = await Bun.build({
    entrypoints: [
      fileURLToPath(
        new URL("./dashboard-menu-prefetch.browser.tsx", import.meta.url),
      ),
    ],
    target: "browser",
    format: "iife",
    define: {
      "process.env.NODE_ENV": JSON.stringify(mode),
      "process.env": JSON.stringify({ NODE_ENV: mode }),
    },
    plugins: [
      {
        name: "inert-next-transport",
        setup(build) {
          build.onResolve({ filter: /^next\/link$/ }, () => ({
            path: Bun.resolveSync("next/dist/client/app-dir/link.js", repoRoot),
          }))
          for (const [filter, path] of [
            [/segment-cache\/scheduler(?:\.js)?$/, "scheduler"],
            [/app-router-instance(?:\.js)?$/, "router"],
            [/components\/navigator(?:\.js)?$/, "router"],
            [/fetch-server-response(?:\.js)?$/, "flight"],
            [/^next\/navigation$/, "navigation"],
            [/^@\/utils$/, "utils"],
            [/^@hugeicons\/core-free-icons$/, "icons"],
            [/^@hugeicons\/react$/, "icon"],
            [/^\.\/nav-icon$/, "navIcon"],
          ] as const)
            build.onResolve({ filter }, () => ({ path, namespace: "inert" }))
          build.onLoad({ filter: /.*/, namespace: "inert" }, (args) => ({
            contents: ports[args.path] ?? "",
            loader: "js",
          }))
        },
      },
    ],
  })
  if (!result.success)
    throw new AggregateError(result.logs, "Inert browser build failed")
  const output = result.outputs[0]
  if (!output) throw new Error("No inert browser output")
  return await output.text()
}
