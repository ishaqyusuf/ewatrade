import vm from 'node:vm';
import {readFile,writeFile} from 'node:fs/promises';
const base=new URL('.',import.meta.url);
const data=await readFile(new URL('data.js',base),'utf8');
const context=vm.createContext({});
vm.runInContext(data+';globalThis.catalog=studies;',context);
const studies=context.catalog;
const plan=await readFile(new URL('../../.brain/plans/2026-10-02-consolidated-imports-sharing-documents-and-pricing.md',base),'utf8');
const tasks=[...plan.matchAll(/^- \[ \] (P\d{2}-\d{2}) (.+)$/gm)].map(([,id,text])=>({id,text}));
if(tasks.length!==171)throw Error('Plan denominator changed; review coverage.');
const rows=tasks.map(t=>({...t,studies:studies.filter(s=>s.tasks.split(' ').includes(t.id)).map(s=>s.id)}));
const nonUI=new Set(['P00-01','P00-08','P00-09','P00-10','P01-01','P01-02','P01-03','P01-04','P01-06','P01-07','P01-08','P01-09','P01-10','P17-01','P17-02','P17-03','P17-04','P17-05','P17-06','P17-09','P17-10','P17-11','P17-12']);
for(const t of rows)if(!t.studies.length&&!nonUI.has(t.id))throw Error('Unmapped task '+t.id);
for(const s of studies)for(const id of s.tasks.split(' '))if(!tasks.some(t=>t.id===id))throw Error('Unknown task '+id);
const doc=`# Phase UI workshop coverage

3 October 2026. Scope: the four selected threads in the consolidated plan.

${studies.length} studies, ${studies.length*3} directions. All 171 task IDs accounted for: ${rows.filter(t=>t.studies.length).length} linked to studies and ${nonUI.size} foundation, decision or acceptance tasks without a new screen. A link records design coverage, not implementation or acceptance of the task.

## Recommendations

| Phase | Feature | Direction | Open |
| --- | --- | --- | --- |
${studies.map(s=>`| ${s.phase} | ${s.title} | 0${s.recommended} | [Compare](index.html#${s.id}) · [Recommended](index.html#${s.id}/${s.recommended}) |`).join('\n')}

## Task map

| Task | Workshop or boundary |
| --- | --- |
${rows.map(t=>`| ${t.id} | ${t.studies.length?t.studies.map(id=>`[${id}](index.html#${id})`).join(', '):t.id.startsWith('P00')?'Product decision / routing proof / design preparation; no new merchant screen.':t.id.startsWith('P01')?'Server contract / persistence / authorization / validation; expressed through consumer screens.':'Acceptance / deployment / documentation gate; workshop checks do not fulfill this gate.'} |`).join('\n')}

## Preserved design references

- Dashboard: approved Inventory 01 Stock ledger; square controls, narrow navigation, compact rows and restrained color.
- Editors: Catalog Direction 02; retained choices, focused review and return.
- Mobile: Clear Counter + Guided Start; simple hierarchy, rounded editor surfaces and existing dock labels. HTML mobile previews are references, not native acceptance.
- Assets: existing approved Catalog illustrations and Precision Rise brand mark. No new image generation.
- Source tokens: apps/dashboard/src/styles/dashboard.css and apps/mobile/src/lib/design-foundation.ts.
- Midday source inspected: components/sheets/invoice-sheet.tsx and components/invoice-sheet-header.tsx. Production work must retain URL-owned sheets, domain forms, shared components and query invalidation.

## Production handoff

These are standalone HTML studies. No application route, schema, entitlement, provider or merchant record changed. Proposed prices, coin amounts, public reuse and consolidation remain proposals. Native paid checkout remains deferred. The conditional paid-license study preserves ADR-0005 until an approved amendment.

File responsibilities for later implementation:

| Workstream | Composition |
| --- | --- |
| Media | Existing Catalog editor and saved photos → gallery sheet → scoped media queries/actions. Preserve retained editor state. |
| Imports | Thin feature entry → URL-owned modal → source/mapping/review/result components → import domain. Dashboard first. |
| Documents | Order/source action → global sheet → template/branding/preview components → immutable document renderer/jobs. |
| Public Store | Merchant settings/share sheet; separate anonymous Product/store pages and safe DTOs. |
| Billing | Business plan/wallet views → separate verified billing/coin commands. Native status only until approved. |
| Internal review | Authorized queue/detail → versioned decisions and dry-run commands. No raw merchant payloads in logs. |

Production integration requires the feature's own contract and acceptance gates. No backend phase is marked complete by this workshop.
`;
await writeFile(new URL('COVERAGE.md',base),doc);
await writeFile(new URL('coverage.json',base),JSON.stringify({studies:studies.length,directions:studies.length*3,taskCount:tasks.length,tasks:rows},null,2));
console.log(`${studies.length} studies / ${studies.length*3} directions; ${rows.length} tasks accounted for.`);
