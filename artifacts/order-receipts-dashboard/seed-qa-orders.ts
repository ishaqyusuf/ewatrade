import {prisma} from '../../packages/db/src/index'
import {getActiveTenantForUser} from '../../packages/db/src/queries/tenants'
import {createCatalogItem} from '../../packages/db/src/queries/catalog'
import {createCommercialOrder} from '../../packages/db/src/queries/commercial-orders'
const user=await prisma.user.findUniqueOrThrow({where:{email:'jawdah.owner@ishaq.qa.test'},select:{id:true}})
const ctx=await getActiveTenantForUser(prisma,{userId:user.id})
if(!ctx || ctx.tenant.dataClassification!=='QA') throw new Error('A QA business is required')
const storeId=ctx.activeStore?.id??ctx.stores[0]?.id
if(!storeId) throw new Error('A QA Store is required')
const source=await createCatalogItem(prisma,{actorUserId:user.id,clientOperationId:'receipt-dashboard-qa-service-v1',tenantId:ctx.tenant.id,storeId,kind:'service',name:'Receipt QA · document demonstration',description:'Synthetic QA receipt acceptance item.',variants:[{key:'default',name:'Default',isDefault:true,offerings:[{key:'standard',name:'Receipt QA service',pricingPolicy:'fixed',fixedPriceMinor:34500,quantityScale:0,workPolicy:'charge_only',authorizationPolicy:'on_order_confirmation'}]}]})
const offering=await prisma.sellableOffering.findFirstOrThrow({where:{tenantId:ctx.tenant.id,catalogItemId:source.id,key:'standard'},select:{id:true}})
for(const index of [1,2]) {
 const order=await createCommercialOrder(prisma,{tenantId:ctx.tenant.id,storeId,actorUserId:user.id,clientOrderId:`receipt-dashboard-qa-order-${index}-v1`,schemaVersion:1,customerName:`Receipt QA Customer ${index}`,createTrackedServiceWork:false,fulfillNow:false,notes:'Synthetic QA receipt download acceptance.',lines:[{offeringId:offering.id,quantity:String(index)}]})
 console.log(order.orderNumber,order.id,order.totalMinor,order.currencyCode)
}
await prisma.$disconnect()
