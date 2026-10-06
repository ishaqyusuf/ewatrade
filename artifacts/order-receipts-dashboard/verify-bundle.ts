import { renderOrderReceipts } from '../../packages/order-receipts/src/pdf'
import { receiptFixture } from '../../packages/order-receipts/src/test-fixture'
const pdf = await renderOrderReceipts([receiptFixture()])
if (!pdf.toString('latin1').includes('/FontFile2')) throw new Error('Font missing')
await Bun.write('/private/tmp/ewatrade-receipt-bundled.pdf', pdf)
console.log('Bundled receipt renderer verified with embedded font')
