const directions = {
  "01": {name:"Overview first", tradeoff:"A familiar tabbed modal. Prices and the latest order lead; deeper history stays one click away."},
  "02": {name:"History alongside", tradeoff:"A wider split modal. Item facts stay visible while you investigate orders and changes."},
  "03": {name:"Progressive brief", tradeoff:"A compact modal with expanding sections. Quick to scan, with less history visible at once."},
}
const icons = {
  close:'<path d="m6 6 12 12M18 6 6 18"/>',
  order:'<path d="M7 3h10l3 5v13H4V8l3-5ZM4 8h16M9 12h6"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  stock:'<path d="m3 7 9-4 9 4v10l-9 4-9-4V7Zm0 0 9 4 9-4M12 11v10"/>',
  price:'<path d="M3 3h9l9 9-9 9-9-9V3Z"/><circle cx="8" cy="8" r="1"/>',
  arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
}
const icon = key => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${icons[key]}</svg>`
const prices = () => `<table class="prices"><thead><tr><th>Egg size</th><th>Per egg</th><th>Per crate</th></tr></thead><tbody><tr><td>Small</td><td>₦160.00</td><td>₦4,800.00</td></tr><tr><td>Big</td><td>₦183.33</td><td>₦5,500.00</td></tr></tbody></table>`
const unitNote = () => `<div class="unit-note inline">${icon('stock')}<span>1 Crate = 30 Eggs · shared stock</span></div>`
const orders = [
  {id:'EW-1042',customer:'Ada Bakery',description:'Big · 2 Crates (60 eggs)',amount:'₦11,000.00',date:'2 Oct 2026 · 09:42',status:'Processing'},
  {id:'EW-1038',customer:'Corner Kitchen',description:'Small · 3 Crates (90 eggs)',amount:'₦14,400.00',date:'1 Oct 2026 · 14:20',status:'Fulfilled'},
  {id:'EW-1031',customer:'Green Market',description:'Big · 15 Eggs',amount:'₦2,749.95',date:'30 Sep 2026 · 11:05',status:'Fulfilled'},
]
const events = [
  {kind:'Orders',icon:'order',title:'Order EW-1042 recorded',detail:'Big · 2 Crates · Ada Bakery',date:'2 Oct 2026 · 09:42'},
  {kind:'Catalog',icon:'price',title:'Big crate price updated',detail:'₦5,400.00 → ₦5,500.00 · Bola',date:'1 Oct 2026 · 17:10'},
  {kind:'Orders',icon:'order',title:'Order EW-1038 fulfilled',detail:'Small · 3 Crates · Corner Kitchen',date:'1 Oct 2026 · 14:55'},
  {kind:'Stock',icon:'stock',title:'Stock receipt recorded',detail:'Small · 300 Eggs · Bola',date:'1 Oct 2026 · 08:30'},
  {kind:'Catalog',icon:'info',title:'Eggs added to catalog',detail:'Small and Big · Egg and Crate · Bola',date:'30 Sep 2026 · 08:00'},
]
const states = Object.fromEntries(Object.keys(directions).map(id => [id,{tab:id==='02'?'Activity':'Overview',filter:'All activity',selectedOrder:null}]))
let active = '01'
let scenario = 'new'
let returnFocus = null
const preview = document.querySelector('#preview')
const detail = document.querySelector('#detail')
const hasHistory = () => scenario==='history'
const empty = (title,copy,key='clock') => `<div class="empty">${icon(key)}<h3>${title}</h3><p>${copy}</p></div>`
function timeline(limit) {
  const source = hasHistory()?events:[{kind:'Catalog',icon:'info',title:'Eggs added to catalog',detail:'Small and Big · Egg and Crate · Bola',date:'2 Oct 2026'}]
  const filtered = source.filter(e => limit!==undefined||states[active].filter==='All activity'||e.kind===states[active].filter)
  if (!filtered.length) return empty('No matching activity','Try another activity type.')
  return `<div class="timeline">${filtered.slice(0,limit??filtered.length).map(e => `<div class="event"><div class="event-icon">${icon(e.icon)}</div><div><p>${e.title}</p><p class="sub">${e.detail}</p><p class="sub">${e.date}</p></div></div>`).join('')}</div>`
}
function facts() {
  return `<div class="fact-grid"><div class="fact"><div class="section-label inline">${icon('order')} Last ordered</div><div class="value">${hasHistory()?'Today, 09:42':'Not ordered yet'}</div><p class="sub">${hasHistory()?'Big · 2 Crates · Ada Bakery':'The latest order will appear here.'}</p>${hasHistory()?'<button class="text-link" data-tab="Orders">View EW-1042 '+icon('arrow')+'</button>':''}</div><div class="fact"><div class="section-label inline">${icon('stock')} Stock on hand</div><div class="value">${hasHistory()?'390 Eggs':'Stock not recorded'}</div><p class="sub">${hasHistory()?'Small 270 · Big 120':'Add an opening balance or stock receipt.'}</p><button class="text-link" data-preview-action="Inventory opens the existing item stock view.">View inventory ${icon('arrow')}</button></div></div>`
}
function overview() {
  return `${facts()}<h3>Customer choices & prices</h3>${prices()}${unitNote()}<div class="row activity-heading"><h3>Recent activity</h3><button class="text-link" data-tab="Activity">All activity ${icon('arrow')}</button></div>${timeline(2)}`
}
function orderList() {
  if (!hasHistory()) return empty('No orders yet','Orders containing Eggs will appear here.','order')
  const selected = orders.find(o=>o.id===states[active].selectedOrder)
  return `<div class="filter"><h3>Orders containing Eggs</h3><span class="sub">3 orders</span></div>${orders.map(o=>`<button class="order-row" data-order="${o.id}"><span><strong>${o.id} · ${o.customer}</strong><p class="sub">${o.description}</p><p class="sub">${o.date}</p></span><span><strong>${o.amount}</strong><p class="sub">${o.status}</p></span></button>`).join('')}${selected?`<div class="order-detail"><div class="eyebrow">ORDER SUMMARY</div><h3>${selected.id} · ${selected.customer}</h3><p>${selected.description} · ${selected.amount}</p><p class="sub">${selected.status} · ${selected.date}</p><p class="sub">Historical line prices are retained with the order.</p></div>`:''}`
}
function activity() {
  return `<div class="filter"><h3>Item activity</h3><select id="activity-filter" aria-label="Activity type">${['All activity','Orders','Catalog','Stock'].map(x=>`<option${states[active].filter===x?' selected':''}>${x}</option>`).join('')}</select></div>${timeline()}`
}
function itemInfo() {
  return `<h3>Customer choices & prices</h3>${prices()}${unitNote()}<div class="fact-grid"><div><div class="section-label">Main unit</div><p>Egg</p></div><div><div class="section-label">Selling unit</div><p>Crate · 30 Eggs</p></div><div><div class="section-label">Category</div><p>Uncategorized</p></div><div><div class="section-label">SKU / Barcode</div><p class="muted">Not set</p></div></div><div class="row"><button data-preview-action="Images opens the existing illustration and photo sheet.">Images</button><button data-preview-action="Configure units opens the existing versioned unit configuration sheet.">Configure units</button></div>`
}
const footer = () => `<footer class="detail-footer"><span>Created ${hasHistory()?'30 Sep':'2 Oct'} 2026</span><span>Updated ${hasHistory()?'1 Oct':'2 Oct'} 2026 · Bola</span></footer>`
const tabs = labels => `<div class="tabs" role="tablist" aria-label="Item information">${labels.map(t=>`<button role="tab" id="tab-${t}" aria-selected="${states[active].tab===t}" aria-controls="panel" tabindex="${states[active].tab===t?'0':'-1'}" data-tab="${t}">${t}</button>`).join('')}</div>`
function render() {
  document.querySelector('#preview-title').textContent = `${active} · ${directions[active].name}`
  document.querySelector('#direction').value = active
  document.querySelector('#scenario').value = scenario
  document.querySelector('#simulation-note').textContent = hasHistory()?'Sample history is fictional. Prices match QA; stock and orders are illustrative. No real actions.':'New-item state matches the QA setup: prices exist, no orders or opening stock. Preview only.'
  detail.className = `product ${active==='02'?'split':active==='03'?'brief':''}`
  const header = `<header class="detail-header"><img src="eggs.svg" alt="Egg tray illustration"><div><div class="inline"><span class="sub">Product</span><span class="badge">Active</span></div><h2>Eggs</h2><p class="sub">2 customer choices · QA Test Merchant</p></div><button class="close" aria-label="Close item preview" data-close>${icon('close')}</button></header>`
  if (active==='01') {
    const t=states[active].tab
    detail.innerHTML = `${header}${tabs(['Overview','Orders','Activity'])}<div class="content" id="panel" role="tabpanel" aria-labelledby="tab-${t}">${t==='Orders'?orderList():t==='Activity'?activity():overview()}</div>${footer()}`
  } else if (active==='02') {
    const t=states[active].tab
    detail.innerHTML = `<div class="split-layout"><aside class="split-sidebar"><img src="eggs.svg" alt="Egg tray illustration"><div class="sub">Product</div><h2>Eggs</h2><span class="badge">Active</span><div class="fact"><div class="section-label">Last ordered</div><strong>${hasHistory()?'Today · 09:42':'Not ordered yet'}</strong><p class="sub">${hasHistory()?'Big · 2 Crates':'No order history yet'}</p></div><div class="fact"><div class="section-label">Stock on hand</div><strong>${hasHistory()?'390 Eggs':'Stock not recorded'}</strong></div>${prices()}${unitNote()}</aside><div class="split-main"><div class="split-head"><span class="sub">Eggs · QA Test Merchant</span><button class="close" aria-label="Close item preview" data-close>${icon('close')}</button></div>${tabs(['Activity','Orders','Details'])}<div class="content" id="panel" role="tabpanel" aria-labelledby="tab-${t}">${t==='Orders'?orderList():t==='Details'?itemInfo():activity()}</div></div></div>${footer()}`
  } else {
    detail.innerHTML = `${header}<div class="content">${facts()}<details open><summary>Choices & prices <span class="sub">Small · Big</span></summary><div class="disclosure-content">${prices()}${unitNote()}</div></details><details id="orders-section"><summary>Order history <span class="sub">${hasHistory()?'3 orders':'No orders yet'}</span></summary><div class="disclosure-content">${orderList()}</div></details><details id="activity-section"><summary>Activity <span class="sub">${hasHistory()?'5 events':'1 event'}</span></summary><div class="disclosure-content">${activity()}</div></details><details><summary>Item information</summary><div class="disclosure-content"><p class="sub">Main unit: Egg · Category: Uncategorized</p><p class="sub">SKU and barcode: Not set</p><div class="row" style="margin-top:12px"><button data-preview-action="Images opens the existing illustration and photo sheet.">Images</button><button data-preview-action="Configure units opens the existing versioned unit configuration sheet.">Configure units</button></div></div></details></div>${footer()}`
  }
  detail.scrollTop = 0
}
function catalog() {
  return `<div class="catalog-chrome"><strong>EwaTrade</strong><span class="sub">QA Test Merchant · BO</span></div><div class="catalog"><p class="sub">QA Test Merchant</p><h2>Catalog</h2><p class="sub">Products and Services with separate stock and work behavior.</p><table class="catalog-table"><thead><tr><th>Item</th><th>Type</th><th>Price</th><th>Actions</th></tr></thead><tbody><tr><td><button class="item-button" data-open="01"><img src="eggs.svg" alt=""><span><strong>Eggs</strong><span class="sub">2 variants</span></span></button></td><td><span class="badge">Product</span></td><td>₦160.00</td><td><span class="ellipsis" aria-hidden="true">⋮</span></td></tr><tr><td>Layers</td><td><span class="badge">Product</span></td><td class="muted">Price not set</td><td>⋮</td></tr><tr><td>Broiler</td><td><span class="badge">Product</span></td><td class="muted">Price not set</td><td>⋮</td></tr></tbody></table></div>`
}
function miniature(id) {
  const title=`<div class="mini-title"><img src="eggs.svg" alt=""><div><strong>Eggs</strong><div class="muted">Product · Active</div></div></div>`
  if(id==='01')return `<div class="mini-window">${title}<div class="mini-tabs"><b>Overview</b><span>Orders</span><span>Activity</span></div><div class="mini-grid"><div class="mini-cell">Last ordered<strong>Today, 09:42</strong>Big · 2 Crates</div><div class="mini-cell">Stock on hand<strong>390 Eggs</strong>Small 270 · Big 120</div></div><div style="margin-top:14px"><strong>Choices & prices</strong>${prices()}</div></div>`
  if(id==='02')return `<div class="mini-window mini-split"><div class="mini-side"><img src="eggs.svg" alt=""><strong>Eggs</strong><p class="muted">Product · Active</p><p>Last ordered<br><b>Today, 09:42</b></p><p>Egg / Crate<br><b>30 eggs</b></p><p>Small ₦160<br>Big ₦183.33</p></div><div class="mini-main"><div class="mini-tabs"><b>Activity</b><span>Orders</span><span>Details</span></div><div class="mini-lines">${events.slice(0,4).map(e=>`<div class="mini-line"><span class="dot"></span><div>${e.title}<div class="muted">${e.date.split(' · ')[0]}</div></div></div>`).join('')}</div></div></div>`
  return `<div class="mini-window mini-brief">${title}<div class="mini-grid"><div class="mini-cell">Last ordered<strong>Today, 09:42</strong></div><div class="mini-cell">Stock on hand<strong>390 Eggs</strong></div></div><div class="mini-disclosure"><b>Choices & prices</b><span>−</span></div><div style="padding:8px 0">Small ₦160 / ₦4,800<br>Big ₦183.33 / ₦5,500</div><div class="mini-disclosure">Order history <span>+</span></div><div class="mini-disclosure">Activity <span>+</span></div></div>`
}
document.querySelector('#gallery').innerHTML = Object.entries(directions).map(([id,d])=>`<article class="direction-card"><header><div class="row"><span class="eyebrow">DIRECTION ${id}</span>${id==='01'?'<span class="badge recommended">Recommended</span>':''}</div><h2>${d.name}</h2><p>${d.tradeoff}</p></header><div class="mini" aria-label="${d.name} visual preview">${miniature(id)}</div><footer><button class="${id==='01'?'primary':''}" data-open="${id}">Try ${id}</button><a href="?option=${id}">Direct preview ↗</a></footer></article>`).join('')
document.querySelector('#entry').innerHTML = catalog()
document.querySelector('#backdrop').innerHTML = catalog()
function open(id,trigger) {
  active=id
  returnFocus=trigger
  render()
  if(!preview.open)preview.showModal()
  history.replaceState(null,'',`?option=${active}`)
  detail.querySelector('[data-close]').focus()
}
function close() { preview.close(); document.querySelector('#message').textContent=''; history.replaceState(null,'',location.pathname); returnFocus?.focus() }
document.addEventListener('click',event=>{
  const opener=event.target.closest('[data-open]')
  if(opener)open(opener.dataset.open,opener)
})
detail.addEventListener('click',event=>{
  const closeButton=event.target.closest('[data-close]')
  if(closeButton){close();return}
  const tab=event.target.closest('[data-tab]')
  if(tab){
    if(active==='03'){const section=detail.querySelector(tab.dataset.tab==='Orders'?'#orders-section':'#activity-section');section.open=true;section.scrollIntoView({block:'nearest'});return}
    states[active].tab=tab.dataset.tab;render();detail.querySelector(`[data-tab="${states[active].tab}"]`)?.focus()
  }
  const order=event.target.closest('[data-order]')
  if(order){states[active].selectedOrder=order.dataset.order;if(active==='03'){const content=detail.querySelector('#orders-section .disclosure-content');content.innerHTML=orderList()}else render()}
  const action=event.target.closest('[data-preview-action]')
  if(action)document.querySelector('#message').textContent=`Preview only: ${action.dataset.previewAction}`
})
detail.addEventListener('change',event=>{
  if(event.target.id==='activity-filter'){
    states[active].filter=event.target.value
    if(active==='03'){detail.querySelector('#activity-section .disclosure-content').innerHTML=activity()}else render()
    detail.querySelector('#activity-filter')?.focus()
  }
})
detail.addEventListener('keydown',event=>{
  if(event.target.getAttribute('role')!=='tab'||!['ArrowRight','ArrowLeft','Home','End'].includes(event.key))return
  event.preventDefault()
  const labels=active==='01'?['Overview','Orders','Activity']:['Activity','Orders','Details']
  let index=labels.indexOf(states[active].tab)
  index=event.key==='Home'?0:event.key==='End'?labels.length-1:(index+(event.key==='ArrowRight'?1:-1)+labels.length)%labels.length
  states[active].tab=labels[index];render();detail.querySelector(`#tab-${labels[index]}`).focus()
})
document.querySelector('#direction').addEventListener('change',event=>{active=event.target.value;render();document.querySelector('#message').textContent='';history.replaceState(null,'',`?option=${active}`)})
document.querySelector('#scenario').addEventListener('change',event=>{scenario=event.target.value;states[active].selectedOrder=null;document.querySelector('#message').textContent='';render()})
document.querySelector('#reset').addEventListener('click',()=>{scenario='new';for(const id of Object.keys(states))states[id]={tab:id==='02'?'Activity':'Overview',filter:'All activity',selectedOrder:null};document.querySelector('#message').textContent='';render()})
document.querySelector('#back').addEventListener('click',close)
preview.addEventListener('cancel',event=>{event.preventDefault();close()})
const initial=new URLSearchParams(location.search).get('option')
if(directions[initial])open(initial,null)
