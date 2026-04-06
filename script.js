// ── DATA ──
const EM={dress:'👗',coat:'🧥',top:'👚',suit:'🤵'};
const BG={dress:'#e8f0eb',coat:'#e0dcc8',top:'#eae4f0',suit:'#ede6d6'};

// Rental bookings: array of {itemId, start: Date, end: Date}
// start/end are JS Date objects (midnight UTC)
const today = new Date(); today.setHours(0,0,0,0);
function daysFromNow(n){const d=new Date(today);d.setDate(d.getDate()+n);return d;}

let items=[
  {id:1,name:'Ivory Bias Gown',boutique:'Atelier Lumière',brand:'The Row',cat:'dress',size:'S',retail:2400,rentals:8,available:true,imgSrc:null,dims:{bust:84,waist:64,hips:90,length:138}},
  {id:2,name:'Obsidian Wool Coat',boutique:'Maison Noir',brand:'Max Mara',cat:'coat',size:'M',retail:1800,rentals:5,available:true,imgSrc:null,dims:{bust:96,waist:88,hips:100,length:110}},
  {id:3,name:'Blush Pleated Midi',boutique:'Atelier Lumière',brand:'Toteme',cat:'dress',size:'M',retail:980,rentals:12,available:false,imgSrc:null,dims:{bust:88,waist:68,hips:94,length:105}},
  {id:4,name:'Cream Tailored Suit',boutique:'Cercle Studio',brand:'Sandro',cat:'suit',size:'L',retail:1600,rentals:3,available:true,imgSrc:null,dims:{bust:100,waist:92,hips:104,length:72}},
  {id:5,name:'Sheer Silk Blouse',boutique:'Maison Noir',brand:'Vince',cat:'top',size:'XS',retail:650,rentals:9,available:true,imgSrc:null,dims:{bust:82,waist:72,hips:84,length:58}},
  {id:6,name:'Cashmere Long Coat',boutique:'Cercle Studio',brand:'Brunello Cucinelli',cat:'coat',size:'S',retail:3200,rentals:2,available:true,imgSrc:null,dims:{bust:90,waist:82,hips:96,length:118}},
];

// Seed some realistic bookings
let bookings=[
  {itemId:1, start:daysFromNow(-8),  end:daysFromNow(-4)},
  {itemId:1, start:daysFromNow(3),   end:daysFromNow(9)},
  {itemId:1, start:daysFromNow(18),  end:daysFromNow(24)},
  {itemId:2, start:daysFromNow(-2),  end:daysFromNow(5)},
  {itemId:2, start:daysFromNow(14),  end:daysFromNow(20)},
  {itemId:3, start:daysFromNow(0),   end:daysFromNow(6)},
  {itemId:4, start:daysFromNow(7),   end:daysFromNow(13)},
  {itemId:5, start:daysFromNow(-5),  end:daysFromNow(-1)},
  {itemId:5, start:daysFromNow(10),  end:daysFromNow(16)},
  {itemId:6, start:daysFromNow(2),   end:daysFromNow(7)},
];

let accounts=[{email:'atelier@email.com',pw:'password123',boutique:'Atelier Lumière'}];
let loggedIn=null,cart=[],currentFilter='all',currentPdpId=null,currentCalId=null,pendingImg=null;
let stripe=null,cardElement=null,stripeReady=false,calFromPortal=false;

// ── STRIPE INIT ──
// Paste your Stripe publishable key from dashboard.stripe.com → Developers → API keys
const STRIPE_PK='pk_test_REPLACE_WITH_YOUR_KEY';
function initStripe(){
  try{
    stripe=Stripe(STRIPE_PK);
    const elements=stripe.elements();
    cardElement=elements.create('card',{
      style:{base:{fontFamily:"'DM Sans',sans-serif",fontSize:'13px',color:'#1a1a1a','::placeholder':{color:'#bbb'}},invalid:{color:'#A32D2D'}}
    });
    cardElement.mount('#stripe-card-element');
    cardElement.on('change',e=>{
      const err=document.getElementById('stripe-err');
      if(e.error){err.textContent=e.error.message;err.style.display='block';}
      else err.style.display='none';
    });
    stripeReady=true;
  }catch(e){
    document.getElementById('stripe-card-element').innerHTML=
      '<div style="display:grid;gap:8px">'
      +'<input class="fi" id="c-cnum" placeholder="4242 4242 4242 4242" maxlength="19" oninput="fmtCard(this)">'
      +'<div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:8px">'
      +'<input class="fi" id="c-exp" placeholder="MM / YY" maxlength="7" oninput="fmtExpiry(this)">'
      +'<input class="fi" id="c-cvc" placeholder="CVC" maxlength="3">'
      +'<input class="fi" id="c-zip" placeholder="Postal code"></div></div>';
  }
}

// ── VIEW SWITCHING ──
function showMain(v){
  if(v==='portal'&&!loggedIn){showMain('login');return;}
  document.querySelectorAll('.view').forEach(el=>el.classList.remove('active'));
  document.getElementById('view-'+v).classList.add('active');
  window.scrollTo(0,0);
  if(v==='cart')renderCart();
  if(v==='checkout'){buildCheckoutSummary();if(!stripeReady)setTimeout(initStripe,200);}
  if(v==='portal'){renderPiecesTab();renderOverviewStats();renderRecent();}
}
function goPortal(){showMain(loggedIn?'portal':'login');}

// ── PRICING ──
function daily(r){return r/30;}
function rentalPrice(r,d){return daily(r)*d*1.2;}

// ── DATE HELPERS ──
function sameDay(a,b){return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate();}
function addDays(d,n){const r=new Date(d);r.setDate(r.getDate()+n);return r;}
// Returns 'rented', 'buffer', 'free' for a given item+date
function getDayStatus(itemId, date){
  for(const b of bookings){
    if(b.itemId!==itemId)continue;
    const s=new Date(b.start),e=new Date(b.end);
    s.setHours(0,0,0,0);e.setHours(0,0,0,0);
    if(date>=s&&date<=e)return'rented';
    // 2-day buffer after end
    const buf1=addDays(e,1),buf2=addDays(e,2);
    if(sameDay(date,buf1)||sameDay(date,buf2))return'buffer';
  }
  return'free';
}

// ── BRAND PILLS ──
function buildBrandPills(){
  const brands=[...new Set(items.map(i=>i.brand))].sort();
  const container=document.getElementById('brand-pills');
  container.innerHTML='<button class="pill active" onclick="setFilter(this,\'all\')">All brands</button>'
    +brands.map(b=>'<button class="pill" onclick="setFilter(this,\''+b.replace(/'/g,"\\'")+'\')">' +b+'</button>').join('');
}
function setFilter(btn,brand){
  document.querySelectorAll('.pill').forEach(p=>p.classList.remove('active'));
  btn.classList.add('active');currentFilter=brand;renderShop();
}
function renderShop(){
  const list=currentFilter==='all'?items:items.filter(i=>i.brand===currentFilter);
  if(!list.length){document.getElementById('shop-content').innerHTML='<div class="empty-s"><div class="empty-ttl">Nothing here yet</div><div class="empty-sub">Check back soon</div></div>';return;}
  // Group by BRAND
  const groups={};
  list.forEach(i=>{(groups[i.brand]=groups[i.brand]||[]).push(i);});
  let html='';
  Object.entries(groups).sort().forEach(([b,its])=>{
    html+='<div class="boutique-section"><div class="boutique-hdr"><div class="boutique-nm">'+b+'</div><div class="boutique-ct">'+its.length+' piece'+(its.length!==1?'s':'')+'</div></div><div class="items-grid">';
    its.forEach(item=>{
      const d=item.dims;
      const img=item.imgSrc?'<img src="'+item.imgSrc+'" alt="'+item.name+'">':'<span>'+EM[item.cat]+'</span>';
      html+='<div class="item-card" onclick="openPdp('+item.id+')">'
        +'<div class="item-img" style="background:'+BG[item.cat]+'">'+img
        +(!item.available?'<div class="sold-over"><span class="sold-pill">Sold out</span></div>':'')
        +'</div><div class="item-info">'
        +'<div class="item-brand">'+item.boutique+'</div>'
        +'<div class="item-name">'+item.name+'</div>'
        +'<div class="item-dims">B'+d.bust+' W'+d.waist+' H'+d.hips+' L'+d.length+'cm · '+item.size+'</div>'
        +'<div class="item-price-txt">From $'+Math.round(daily(item.retail))+'/day</div>'
        +'<button class="add-btn"'+(item.available?'':' disabled')+' onclick="event.stopPropagation();addToCart('+item.id+')">'
        +(item.available?'Add to bag':'Unavailable')+'</button>'
        +'<button class="cal-btn" onclick="event.stopPropagation();openCal('+item.id+',false)">Check availability</button>'
        +'</div></div>';
    });
    html+='</div></div>';
  });
  document.getElementById('shop-content').innerHTML=html;
}

// ── PDP ──
function openPdp(id){
  const item=items.find(i=>i.id===id);if(!item)return;
  currentPdpId=id;
  const imgEl=document.getElementById('pdp-img');
  imgEl.innerHTML=item.imgSrc?'<img src="'+item.imgSrc+'" alt="'+item.name+'">':'<span style="font-size:100px">'+EM[item.cat]+'</span>';
  imgEl.style.background=item.imgSrc?'#111':BG[item.cat];
  document.getElementById('pdp-brand').textContent=item.brand;
  document.getElementById('pdp-name').textContent=item.name;
  document.getElementById('pdp-boutique').textContent=item.boutique+' · Size '+item.size;
  const d=item.dims;
  document.getElementById('pdp-dims').innerHTML=
    '<div class="dim-box"><div class="dim-val">'+d.bust+'</div><div class="dim-lbl">Bust cm</div></div>'
    +'<div class="dim-box"><div class="dim-val">'+d.waist+'</div><div class="dim-lbl">Waist cm</div></div>'
    +'<div class="dim-box"><div class="dim-val">'+d.hips+'</div><div class="dim-lbl">Hips cm</div></div>'
    +'<div class="dim-box"><div class="dim-val">'+d.length+'</div><div class="dim-lbl">Length cm</div></div>';
  document.getElementById('pdp-price').innerHTML=
    '<strong>$'+Math.round(daily(item.retail))+'/day</strong> &nbsp;·&nbsp; '
    +'3-day: <strong>$'+rentalPrice(item.retail,3).toFixed(2)+'</strong> &nbsp;·&nbsp; '
    +'7-day: <strong>$'+rentalPrice(item.retail,7).toFixed(2)+'</strong>';
  const btn=document.getElementById('pdp-add-btn');
  btn.disabled=!item.available;btn.textContent=item.available?'Add to bag':'Currently unavailable';
  showMain('pdp');
}
function pdpAddToCart(){if(currentPdpId)addToCart(currentPdpId);showMain('shop');}
function openCalFromPdp(){openCal(currentPdpId,false);}

// ── CALENDAR ──
function openCal(itemId, fromPortal){
  const item=items.find(i=>i.id===itemId);if(!item)return;
  currentCalId=itemId;
  calFromPortal=fromPortal;
  // back button destination
  document.getElementById('cal-back').onclick=fromPortal?()=>showMain('portal'):()=>showMain('pdp');
  document.getElementById('cal-back').textContent=fromPortal?'← Back to portal':'← Back to item';
  // header
  const thumb=document.getElementById('cal-thumb');
  thumb.innerHTML=item.imgSrc?'<img src="'+item.imgSrc+'" alt="">':'<span>'+EM[item.cat]+'</span>';
  thumb.style.background=item.imgSrc?'#111':BG[item.cat];
  document.getElementById('cal-item-name').textContent=item.name;
  document.getElementById('cal-item-meta').textContent=item.boutique+' · '+item.brand+' · Size '+item.size;
  // render 3 months
  renderCalMonths(itemId);
  showMain('cal');
}

function renderCalMonths(itemId){
  const DAYS=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
  let html='';
  const startMonth=new Date(today.getFullYear(),today.getMonth(),1);
  for(let m=0;m<3;m++){
    const month=new Date(startMonth.getFullYear(),startMonth.getMonth()+m,1);
    const year=month.getFullYear(),mon=month.getMonth();
    const firstDay=month.getDay();
    const daysInMonth=new Date(year,mon+1,0).getDate();
    html+='<div><div class="cal-month-title">'+MONTHS[mon]+' '+year+'</div><div class="cal-grid">';
    DAYS.forEach(d=>html+='<div class="cal-day-label">'+d+'</div>');
    for(let blank=0;blank<firstDay;blank++)html+='<div class="cal-day empty"></div>';
    for(let day=1;day<=daysInMonth;day++){
      const date=new Date(year,mon,day);date.setHours(0,0,0,0);
      const status=getDayStatus(itemId,date);
      const isToday=sameDay(date,today);
      let cls='cal-day '+status+(isToday?' today':'');
      html+='<div class="'+cls+'" title="'+MONTHS[mon]+' '+day+' — '+status+'">'+day+'</div>';
    }
    html+='</div></div>';
  }
  document.getElementById('cal-months').innerHTML=html;
}

// ── CART ──
function addToCart(id){
  const item=items.find(i=>i.id===id);if(!item||!item.available)return;
  const ex=cart.find(c=>c.id===id);
  if(ex){showToast('"'+item.name+'" is already in your bag');return;}
  // Default start = first available day from today
  const startDate=firstAvailableDate(id);
  cart.push({id,days:3,startDate,calMonth:new Date(startDate.getFullYear(),startDate.getMonth(),1)});
  updateBadge();showMain('cart');showToast('"'+item.name+'" added — pick your dates below');
}
function firstAvailableDate(itemId){
  let d=new Date(today);
  for(let i=0;i<90;i++){
    const s=getDayStatus(itemId,d);
    if(s==='free')return new Date(d);
    d=addDays(d,1);
  }
  return new Date(today);
}
function updateBadge(){document.getElementById('cart-count').textContent=cart.length;}
function removeFromCart(id){cart=cart.filter(c=>c.id!==id);updateBadge();renderCart();}

function renderCart(){
  const el=document.getElementById('cart-content');
  if(!cart.length){
    el.innerHTML='<div class="empty-s"><div class="empty-ttl">Your bag is empty</div><div class="empty-sub" style="margin-bottom:1.5rem">Browse the collection and add pieces you love</div><button class="ghost-btn" onclick="showMain(\'shop\')">Browse collection</button></div>';
    return;
  }
  let sub=0,rows='';
  cart.forEach(c=>{
    const item=items.find(i=>i.id===c.id);if(!item)return;
    const price=rentalPrice(item.retail,c.days);sub+=price;
    const thumb=item.imgSrc?'<img src="'+item.imgSrc+'" alt="">':'<span>'+EM[item.cat]+'</span>';
    const endDate=addDays(c.startDate,c.days-1);
    const fmt=d=>d.toLocaleDateString('en-CA',{month:'short',day:'numeric'});
    rows+='<div class="cart-item">'
      +'<div class="cart-thumb" style="background:'+BG[item.cat]+'">'+thumb+'</div>'
      +'<div class="cart-det" style="flex:1;min-width:0">'
      +'<div class="cart-nm">'+item.name+'</div>'
      +'<div class="cart-meta">'+item.boutique+' · '+item.brand+' · Size '+item.size+'</div>'
      +'<div class="cart-date-section">'
      +'<span class="cart-date-label">Select rental dates</span>'
      +buildMiniCal(c)
      +'<div class="cart-dates-display" id="dates-display-'+item.id+'">'+fmt(c.startDate)+' → '+fmt(endDate)+' &nbsp;('+c.days+' day'+(c.days!==1?'s':'')+')</div>'
      +'</div>'
      +'<button class="rm-btn" onclick="removeFromCart('+item.id+')">Remove</button>'
      +'</div>'
      +'<div class="price-col"><div class="line-price">$'+price.toFixed(2)+'</div><div class="line-days">'+c.days+'d</div></div>'
      +'</div>';
  });
  const cut=sub-sub/1.2;
  el.innerHTML=rows+'<div class="cart-summary">'
    +'<div class="sum-row"><span>Rental cost</span><span>$'+(sub/1.2).toFixed(2)+'</span></div>'
    +'<div class="sum-row"><span>Platform fee (20%)</span><span>$'+cut.toFixed(2)+'</span></div>'
    +'<div class="sum-total"><span>Total</span><span>$'+sub.toFixed(2)+'</span></div>'
    +'<button class="cta-btn" onclick="goCheckout()">Proceed to checkout</button></div>';
}

function buildMiniCal(cartEntry){
  const item=items.find(i=>i.id===cartEntry.id);
  const mon=cartEntry.calMonth;
  const year=mon.getFullYear(),month=mon.getMonth();
  const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const DAYS=['S','M','T','W','T','F','S'];
  const firstDay=new Date(year,month,1).getDay();
  const daysInMonth=new Date(year,month+1,0).getDate();
  const startD=new Date(cartEntry.startDate);startD.setHours(0,0,0,0);
  const endD=addDays(startD,cartEntry.days-1);endD.setHours(0,0,0,0);

  let html='<div class="mini-cal">'
    +'<div class="mini-cal-header">'
    +'<button class="mini-cal-nav" onclick="miniCalNav('+cartEntry.id+',-1)">‹</button>'
    +'<span class="mini-cal-month">'+MONTHS[month]+' '+year+'</span>'
    +'<button class="mini-cal-nav" onclick="miniCalNav('+cartEntry.id+',1)">›</button>'
    +'</div>'
    +'<div class="mini-cal-grid">';
  DAYS.forEach(d=>html+='<div class="mc-dl">'+d+'</div>');
  for(let b=0;b<firstDay;b++)html+='<div class="mc-day mc-empty"></div>';
  for(let day=1;day<=daysInMonth;day++){
    const date=new Date(year,month,day);date.setHours(0,0,0,0);
    const status=getDayStatus(cartEntry.id,date);
    const isPast=date<today;
    let cls='mc-day';
    if(isPast)cls+=' mc-past';
    else if(status==='rented')cls+=' mc-rented';
    else if(status==='buffer')cls+=' mc-buf';
    else if(sameDay(date,startD))cls+=' mc-selected';
    else if(sameDay(date,endD))cls+=' mc-range-end';
    else if(date>startD&&date<endD)cls+=' mc-range';
    const clickable=!isPast&&status==='free'&&!sameDay(date,startD)?'onclick="cartPickDate('+cartEntry.id+','+year+','+(month)+','+day+')"':'';
    html+='<div class="'+cls+'" '+clickable+'>'+day+'</div>';
  }
  html+='</div></div>';
  return html;
}

function miniCalNav(itemId,dir){
  const c=cart.find(c=>c.id===itemId);if(!c)return;
  c.calMonth=new Date(c.calMonth.getFullYear(),c.calMonth.getMonth()+dir,1);
  renderCart();
}

function cartPickDate(itemId,year,month,day){
  const c=cart.find(c=>c.id===itemId);if(!c)return;
  const picked=new Date(year,month,day);picked.setHours(0,0,0,0);
  // If clicking start is already set and we're picking a later date, set as end (compute days)
  const startD=new Date(c.startDate);startD.setHours(0,0,0,0);
  if(picked>startD){
    // Check no blocked dates in range
    let blocked=false;
    let check=new Date(startD);
    while(check<=picked){
      const s=getDayStatus(itemId,check);
      if(s==='rented'||s==='buffer'){blocked=true;break;}
      check=addDays(check,1);
    }
    if(!blocked){
      const diffMs=picked-startD;
      const diffDays=Math.round(diffMs/(1000*60*60*24))+1;
      c.days=Math.max(1,Math.min(30,diffDays));
      renderCart();return;
    }
  }
  // Otherwise set as new start date
  c.startDate=new Date(picked);
  c.calMonth=new Date(year,month,1);
  // validate days don't overlap blocked dates
  let ok=true,checkEnd=addDays(c.startDate,c.days-1);
  let cur=new Date(c.startDate);
  while(cur<=checkEnd){
    const s=getDayStatus(itemId,cur);
    if(s==='rented'||s==='buffer'){ok=false;break;}
    cur=addDays(cur,1);
  }
  if(!ok)c.days=1;
  renderCart();
}

function goCheckout(){buildCheckoutSummary();showMain('checkout');}
function buildCheckoutSummary(){
  const fmt=d=>d.toLocaleDateString('en-CA',{month:'short',day:'numeric',year:'numeric'});
  let s='',total=0;
  cart.forEach(c=>{
    const item=items.find(i=>i.id===c.id);if(!item)return;
    const p=rentalPrice(item.retail,c.days);total+=p;
    const end=addDays(c.startDate,c.days-1);
    s+='<div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:6px;color:var(--muted)"><span>'+item.name+'<br><span style="font-size:10px;color:var(--hint)">'+fmt(c.startDate)+' → '+fmt(end)+' ('+c.days+'d)</span></span><span style="white-space:nowrap;padding-left:8px">$'+p.toFixed(2)+'</span></div>';
  });
  document.getElementById('co-summary').innerHTML=s+'<div style="display:flex;justify-content:space-between;font-size:14px;font-weight:500;color:var(--em);border-top:1px solid var(--eml2);padding-top:10px;margin-top:6px"><span>Total</span><span>$'+total.toFixed(2)+'</span></div>';
  if(!stripeReady)setTimeout(initStripe,300);
}
function fmtCard(inp){let v=inp.value.replace(/\D/g,'').slice(0,16);inp.value=v.replace(/(.{4})/g,'$1 ').trim();}
function fmtExpiry(inp){let v=inp.value.replace(/\D/g,'').slice(0,4);if(v.length>2)v=v.slice(0,2)+' / '+v.slice(2);inp.value=v;}
function getTotal(){let t=0;cart.forEach(c=>{const i=items.find(x=>x.id===c.id);if(i)t+=rentalPrice(i.retail,c.days);});return t;}

async function placeOrder(){
  const first=document.getElementById('c-first').value.trim();
  const last=document.getElementById('c-last').value.trim();
  const email=document.getElementById('c-email').value.trim();
  const infoErr=document.getElementById('info-err'),stripeErr=document.getElementById('stripe-err');
  infoErr.style.display='none';stripeErr.style.display='none';
  if(!first||!last||!email.includes('@')){infoErr.style.display='block';return;}
  const btn=document.getElementById('pay-btn');
  btn.disabled=true;btn.textContent='Processing...';

  if(stripeReady&&cardElement){
    // Production: create PaymentIntent on your server, confirm here
    // const {clientSecret} = await fetch('/create-payment-intent',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({amount:Math.round(getTotal()*100),currency:'cad'})}).then(r=>r.json());
    // const result = await stripe.confirmCardPayment(clientSecret,{payment_method:{card:cardElement,billing_details:{name:document.getElementById('c-cname').value}}});
    // if(result.error){stripeErr.textContent=result.error.message;stripeErr.style.display='block';btn.disabled=false;btn.textContent='Complete rental';return;}
    await new Promise(r=>setTimeout(r,1200));
  } else {
    const cnum=(document.getElementById('c-cnum')||{}).value||'';
    const cexp=(document.getElementById('c-exp')||{}).value||'';
    const ccvc=(document.getElementById('c-cvc')||{}).value||'';
    if(cnum.replace(/\s/g,'').length<15||cexp.length<4||ccvc.length<3){
      stripeErr.textContent='Please complete your card details.';stripeErr.style.display='block';
      btn.disabled=false;btn.textContent='Complete rental';return;
    }
    await new Promise(r=>setTimeout(r,800));
  }

  // Mark rented + add bookings using chosen start dates
  let total=0,rows='';
  const fmt=d=>d.toLocaleDateString('en-CA',{month:'short',day:'numeric'});
  cart.forEach(c=>{
    const item=items.find(i=>i.id===c.id);if(!item)return;
    const p=rentalPrice(item.retail,c.days);total+=p;
    item.available=false;item.rentals++;
    const rentalEnd=addDays(c.startDate,c.days-1);
    bookings.push({itemId:item.id,start:new Date(c.startDate),end:new Date(rentalEnd)});
    rows+='<div class="c-row"><span>'+item.name+'<br><span style="font-size:11px;color:var(--hint)">'+fmt(c.startDate)+' → '+fmt(rentalEnd)+'</span></span><span>$'+p.toFixed(2)+'</span></div>';
  });
  rows+='<div class="c-row total"><span>Total charged</span><span>$'+total.toFixed(2)+'</span></div>';
  document.getElementById('confirm-sub').innerHTML='Confirmation sent to <strong>'+email+'</strong>.<br>Your items will be delivered within 24 hours.';
  document.getElementById('confirm-box').innerHTML=rows;
  cart=[];updateBadge();renderShop();
  btn.disabled=false;btn.textContent='Complete rental';
  showMain('confirm');
}

// ── AUTH ──
function clearErr(id){const el=document.getElementById(id);if(el)el.style.display='none';}
function doLogin(){
  const email=document.getElementById('l-email').value.trim();
  const pw=document.getElementById('l-pw').value;
  const err=document.getElementById('login-err');
  const acc=accounts.find(a=>a.email===email&&a.pw===pw);
  if(!acc){err.style.display='block';return;}
  err.style.display='none';loggedIn=acc;
  document.getElementById('portal-boutique-nm').textContent=acc.boutique;
  document.getElementById('portal-email-lbl').textContent=acc.email;
  showMain('portal');
}
function createAccount(){
  const name=document.getElementById('s-name').value.trim();
  const email=document.getElementById('s-email').value.trim();
  const pw=document.getElementById('s-pw').value;
  const err=document.getElementById('signup-err');
  if(!name||!email||!pw){err.textContent='Please fill in all fields.';err.style.display='block';return;}
  if(pw.length<6){err.textContent='Password must be at least 6 characters.';err.style.display='block';return;}
  if(!email.includes('@')){err.textContent='Please enter a valid email.';err.style.display='block';return;}
  if(accounts.find(a=>a.email===email)){err.textContent='Email already registered.';err.style.display='block';return;}
  err.style.display='none';
  const acc={email,pw,boutique:name};accounts.push(acc);loggedIn=acc;
  document.getElementById('portal-boutique-nm').textContent=name;
  document.getElementById('portal-email-lbl').textContent=email;
  showMain('portal');showToast('Welcome, '+name+'!');
}
function doLogout(){loggedIn=null;showMain('login');}

// ── PORTAL ──
function showPortalTab(el,tab){
  document.querySelectorAll('.portal-nav-item').forEach(n=>n.classList.remove('active'));
  el.classList.add('active');
  ['pieces','add','overview'].forEach(t=>document.getElementById('pp-'+t).style.display=t===tab?'block':'none');
  if(tab==='pieces')renderPiecesTab();
  if(tab==='overview'){renderOverviewStats();renderRecent();}
}

function renderPiecesTab(){
  const myItems=loggedIn?items.filter(i=>i.boutique===loggedIn.boutique):items;
  const avail=myItems.filter(i=>i.available).length;
  document.getElementById('pieces-stats').innerHTML=
    '<div class="stat"><div class="stat-lbl">My pieces</div><div class="stat-val">'+myItems.length+'</div></div>'
    +'<div class="stat"><div class="stat-lbl">Available</div><div class="stat-val">'+avail+'</div></div>'
    +'<div class="stat"><div class="stat-lbl">Sold out</div><div class="stat-val">'+(myItems.length-avail)+'</div></div>';
  if(!myItems.length){
    document.getElementById('pieces-grid').innerHTML='<div style="grid-column:1/-1;text-align:center;padding:3rem;color:var(--hint);font-size:13px">No pieces yet. Use <strong>Add New Piece</strong> to get started.</div>';return;
  }
  document.getElementById('pieces-grid').innerHTML=myItems.map(item=>{
    const d=item.dims;
    const img=item.imgSrc?'<img src="'+item.imgSrc+'" alt="'+item.name+'">':'<span>'+EM[item.cat]+'</span>';
    return '<div class="piece-card">'
      +'<div class="piece-img" style="background:'+BG[item.cat]+'">'+img
      +(!item.available?'<div class="piece-sold-over"><span class="piece-sold-pill">Sold out</span></div>':'')
      +'</div>'
      +'<div class="piece-info">'
      +'<div class="piece-brand-lbl">'+item.brand+'</div>'
      +'<div class="piece-title">'+item.name+'</div>'
      +'<div class="piece-meta">Size '+item.size+' · B'+d.bust+' W'+d.waist+' H'+d.hips+'cm</div>'
      +'<div class="piece-rate">$'+Math.round(daily(item.retail))+'/day · '+item.rentals+' rentals</div>'
      +'<div class="piece-actions">'
      +'<button class="toggle-avail-btn '+(item.available?'ta-avail':'ta-sold')+'" onclick="toggleAvail('+item.id+')">'
      +(item.available?'Mark as sold out':'Mark as available')+'</button>'
      +'<button class="view-cal-sm" onclick="openCal('+item.id+',true)">View rental calendar</button>'
      +'</div></div></div>';
  }).join('');
}

function renderOverviewStats(){
  const total=items.length,avail=items.filter(i=>i.available).length;
  const tots=items.reduce((s,i)=>s+i.rentals,0);
  document.getElementById('overview-stats').innerHTML=
    '<div class="stat"><div class="stat-lbl">All pieces</div><div class="stat-val">'+total+'</div></div>'
    +'<div class="stat"><div class="stat-lbl">Available</div><div class="stat-val">'+avail+'</div></div>'
    +'<div class="stat"><div class="stat-lbl">Rented out</div><div class="stat-val">'+(total-avail)+'</div></div>'
    +'<div class="stat"><div class="stat-lbl">Total rentals</div><div class="stat-val">'+tots+'</div></div>';
}
function renderRecent(){
  const recent=[{item:'Ivory Bias Gown',renter:'Camille B.',days:5,total:'$192.00'},{item:'Sheer Silk Blouse',renter:'Sofia R.',days:3,total:'$78.00'},{item:'Obsidian Wool Coat',renter:'Nina C.',days:7,total:'$252.00'}];
  document.getElementById('p-recent').innerHTML=recent.map(r=>
    '<div style="display:flex;justify-content:space-between;align-items:center;padding:11px 0;border-bottom:0.5px solid var(--bdr);font-size:13px">'
    +'<div><div style="color:var(--em);font-weight:400">'+r.item+'</div><div style="color:var(--hint);font-size:11px">'+r.renter+' · '+r.days+' days</div></div>'
    +'<div style="color:var(--gd);font-weight:500">'+r.total+'</div></div>').join('');
}

function handleImg(input){
  const file=input.files[0];if(!file)return;
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)){showToast('Please upload a JPG or PNG');input.value='';return;}
  if(file.size>10*1024*1024){showToast('Image must be under 10MB');input.value='';return;}
  const reader=new FileReader();
  reader.onload=e=>{
    pendingImg=e.target.result;
    const pv=document.getElementById('up-preview');
    pv.src=pendingImg;pv.classList.add('show');
    document.getElementById('up-icon').style.display='none';
    document.getElementById('up-txt').textContent='Photo ready!';
    document.getElementById('up-sub').textContent='Tap to change';
  };
  reader.readAsDataURL(file);
}

function addPiece(){
  const name=document.getElementById('p-name').value.trim();
  const retail=parseInt(document.getElementById('p-retail').value);
  const err=document.getElementById('add-err');
  if(!name||!retail||retail<1){err.style.display='block';return;}
  err.style.display='none';
  items.push({
    id:Date.now(),name,
    boutique:loggedIn?loggedIn.boutique:'My Boutique',
    brand:document.getElementById('p-brand').value.trim()||'Independent',
    cat:document.getElementById('p-cat').value,
    size:document.getElementById('p-size').value,
    retail,rentals:0,available:true,imgSrc:pendingImg,
    dims:{bust:parseInt(document.getElementById('p-bust').value)||88,
      waist:parseInt(document.getElementById('p-waist').value)||68,
      hips:parseInt(document.getElementById('p-hips').value)||94,
      length:parseInt(document.getElementById('p-length').value)||100}
  });
  ['p-name','p-brand','p-retail','p-bust','p-waist','p-hips','p-length'].forEach(id=>document.getElementById(id).value='');
  const pv=document.getElementById('up-preview');
  pv.src='';pv.classList.remove('show');
  document.getElementById('up-icon').style.display='flex';
  document.getElementById('up-txt').textContent='Upload clothing photo';
  document.getElementById('up-sub').textContent='JPG or PNG · tap to browse';
  document.getElementById('img-up').value='';pendingImg=null;
  buildBrandPills();
  renderShop();
  // switch to My Pieces tab to show result
  showPortalTab(document.getElementById('ptab-pieces'),'pieces');
}

function toggleAvail(id){
  const item=items.find(i=>i.id===id);if(!item)return;
  item.available=!item.available;
  renderPiecesTab();renderShop();
  showToast(item.name+' marked as '+(item.available?'available':'sold out'));
}

// ── TOAST ──
let toastTimer;
function showToast(msg){
  const t=document.getElementById('toast');
  t.textContent=msg;t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>t.classList.remove('show'),2800);
}

// ── INIT ──
buildBrandPills();
renderShop();
  toastTimer=setTimeout(()=>t.classList.remove('show'),2800);
}

// ── INIT ──
buildBrandPills();
renderShop();
```
