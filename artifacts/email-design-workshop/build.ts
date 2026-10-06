import { mkdir, writeFile } from 'node:fs/promises'
import { directions, scenarios, renderEmail } from './design.js'
import { renderMarketingWaitlistAdminTemplate } from '../../packages/email/templates/marketing-waitlist-admin'

const root = new URL('./', import.meta.url)
await mkdir(new URL('./samples/',root), {recursive:true})
for (const d of directions) {
  for (const message of scenarios()) {
    await writeFile(new URL(`samples/${d.id}-${message.id}.html`, root), renderEmail(d,message))
  }
}
await writeFile(new URL('baseline.html',root),renderMarketingWaitlistAdminTemplate({id:'demo-waitlist-1042',fullName:'Amina Bello',email:'amina@example.test'}).html)
console.log(`Built ${directions.length} directions × ${scenarios().length} scenarios, plus actual source baseline. No dispatch.`)
// The synchronous React renderer can retain a MessagePort after this CLI completes.
process.exit(0)
