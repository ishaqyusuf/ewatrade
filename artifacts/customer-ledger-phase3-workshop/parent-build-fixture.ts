// Isolated QA bundle. Next replaces Server Actions with RPC references in production;
// this fixture refuses persistence rather than bundling a database client in the browser.
const result = await Bun.build({
 entrypoints:["./artifacts/customer-ledger-phase3-workshop/parent-browser-fixture.tsx"],
 target:"browser",
 outdir:"./apps/dashboard/public/parent-customer-ledger-review",
 naming:"fixture.js",
 define:{"process.env.NODE_ENV":'"production"',"process.env.NEXT_PUBLIC_PLATFORM_DOMAIN":'"ewatrade.com"'},
 plugins:[{name:"fixture-server-action-boundary",setup(build){
  build.onResolve({filter:/update-table-settings-action/},()=>({path:"layout-persistence",namespace:"fixture"}))
  build.onLoad({filter:/.*/,namespace:"fixture"},()=>({contents:'export async function updateTableSettingsAction(){return {error:"Read-only browser fixture: layout persistence disabled."}}',loader:"js"}))
 }}],
})
if(!result.success) { console.error(result.logs);process.exit(1) }
console.log("Read-only fixture bundle built.")
