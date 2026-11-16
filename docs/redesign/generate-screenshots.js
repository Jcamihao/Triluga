const { chromium } = require('playwright');
const OUT = __dirname + '/shots';
const B = 'http://localhost:4200';
const imgs = ['economy','suv','luxury','electric','classic','travel','luxury_exec','motorcycle'].map(n=>`${B}/assets/categories/${n}.png`);
const mk = (i, o={}) => ({
  id:'v'+i, slug:'v'+i, title:['Onix LT 1.0','Compass Longitude','BMW 320i M Sport','Tesla Model 3','Fusca 1974','Spin Premier','Mercedes C300','Honda CG 160'][i%8],
  brand:['Chevrolet','Jeep','BMW','Tesla','Volkswagen','Chevrolet','Mercedes','Honda'][i%8], model:'Modelo', year:2020+(i%5),
  city:'São Paulo', state:'SP', vehicleType: i%8===7?'MOTORCYCLE':'CAR', category:'SEDAN', seats:5, transmission:'AUTOMATIC', fuelType:'FLEX',
  dailyRate:120+i*35, weeklyEstimate:700+i*200, monthlyEstimate:2600+i*700, minRentalDays:3, minPeriodTotal:450,
  hasInsurance:true, mechanicsCondition:'EXCELLENT', hasDetranIssues:false, trunkSize:400, kmPolicy:'FREE',
  latitude:-23.55, longitude:-46.63, ratingAverage:4.6, reviewsCount:12, isFeatured:i<3, coverImage:imgs[i%8], previewImages:[imgs[i%8],imgs[(i+1)%8]],
  description:'Veículo muito bem cuidado, revisões em dia, ideal para viagens e uso diário.', addressLine:'Av. Paulista, 1000',
  isPublished:true, isActive:true, plate:'ABC1D23', viewsCount:340, viewsLast30Days:120, favoritesCount:18, contactsCount:9,
  images: imgs.slice(0,4).map((u,k)=>({id:'i'+k,url:u,alt:'',position:k})),
  reviews:[{id:'r1',rating:5,comment:'Excelente carro, dono atencioso!',createdAt:'2026-10-01T10:00:00Z',author:{id:'u2',fullName:'Maria Souza'}}],
  owner:{id:'u2',fullName:'Carlos Silva',avatarUrl:null,city:'São Paulo',state:'SP',phone:'11999999999',ratingAverage:4.8,reviewsCount:23,responseRate:95}, ...o});
const cars = Array.from({length:8},(_,i)=>mk(i));
const user = {id:'u1',email:'admin.triluga@triluga.com',role:'ADMIN',status:'ACTIVE',emailVerified:true,createdAt:'2026-01-01T00:00:00Z',
  profile:{fullName:'João Marcus',phone:'11988887777',zipCode:'01310-100',addressLine:'Av. Paulista, 1000',city:'São Paulo',state:'SP',bio:'Locador há 3 anos.',avatarUrl:null,documentNumber:'123.456.789-00',driverLicenseNumber:'12345678900'}};
const conv = [0,1,2].map(i=>({id:'c'+i,vehicle:{id:'v'+i,slug:'v'+i,title:cars[i].title,coverImage:imgs[i],city:'São Paulo',state:'SP',dailyRate:150,weeklyEstimate:900,monthlyEstimate:3000,minRentalDays:3,minPeriodTotal:450},
  otherParticipant:{id:'u2',email:'a@b.com',fullName:['Carlos Silva','Ana Lima','Pedro Rocha'][i],avatarUrl:null,isOnline:i===0},
  lastMessage:{id:'m'+i,content:'Olá! O carro ainda está disponível?',createdAt:'2026-11-11T12:00:00Z',senderId:'u2'},unreadCount:i,updatedAt:'2026-11-11T12:00:00Z'}));
const adminOverview = {period:'7d',totals:{users:1240,vehicles:386,privacyRequests:4,visits:9800,views:15200,chats:310,favorites:880,reports:3},series:[],topVehicles:[],recentUsers:[],recentVehicles:[]};
function route(url, method){
  const p = url.replace(/^.*\/api\/v1/,'').split('?')[0];
  if (method!=='GET') return {ok:true,message:'ok',success:true};
  if (p==='/auth/me') return user;
  if (p==='/vehicles') return {items:cars,meta:{total:8,page:1,limit:12,hasNextPage:false}};
  if (p==='/vehicles/me') return cars.slice(0,4);
  if (p==='/vehicles/cities') return [{city:'São Paulo',state:'SP',count:120},{city:'Rio de Janeiro',state:'RJ',count:80}];
  if (p==='/vehicles/stats') return {electric:12,economy:80,sedan:60,suvPickup:45};
  if (/^\/vehicles\/[^/]+\/similar/.test(p)) return cars.slice(1,5);
  if (/^\/vehicles\/[^/]+\/metrics/.test(p)) return {views:100,contacts:5,favorites:9};
  if (/^\/vehicles\/[^/]+$/.test(p)) return cars[0];
  if (p==='/favorites/my') return cars.slice(0,5);
  if (p==='/chats') return conv;
  if (/^\/chats\/.+\/messages/.test(p)) return [{id:'a',content:'Olá! O carro ainda está disponível?',createdAt:'2026-11-11T12:00:00Z',senderId:'u2'},{id:'b',content:'Sim, está disponível!',createdAt:'2026-11-11T12:05:00Z',senderId:'u1'}];
  if (p==='/profiles/me') return user.profile;
  if (/^\/profiles\//.test(p)) return {id:'u2',role:'USER',memberSince:'2024-02-01',fullName:'Carlos Silva',avatarUrl:null,bio:'Aluga carros com carinho.',city:'São Paulo',state:'SP',ratingAverage:4.8,reviewsCount:23,activeListingsCount:4,responseTimeLabel:'Responde em 1h',trustMetrics:{activeListingsCount:4,reviewsCount:23,averageRating:4.8},reviews:[{id:'r1',rating:5,comment:'Ótimo!',createdAt:'2026-10-01T10:00:00Z',author:{id:'u3',fullName:'Maria'}}],vehicles:cars.slice(0,4)};
  if (p==='/privacy/policy') return {version:'1.0',contactEmail:'privacidade@triluga.com',sections:[{title:'Dados coletados',summary:'Coletamos dados de cadastro e uso.'},{title:'Seus direitos',summary:'Acesso, correção e exclusão.'}]};
  if (p==='/privacy/me') return {policy:{version:'1.0',contactEmail:'privacidade@triluga.com',sections:[{title:'Dados coletados',summary:'Coletamos dados de cadastro e uso.'}]},preferences:{analyticsConsentGranted:true},requests:[{id:'p1',type:'ACCESS',status:'OPEN',createdAt:'2026-11-01T00:00:00Z',updatedAt:'2026-11-01T00:00:00Z'}]};
  if (p==='/notifications/my') return [{id:'n1',title:'Nova mensagem',message:'Carlos enviou uma mensagem',type:'CHAT',isRead:false,createdAt:'2026-11-11T12:00:00Z'}];
  if (p==='/featured/plans') return [{id:'f1',name:'Destaque 7 dias',durationDays:7,price:29.9},{id:'f2',name:'Destaque 30 dias',durationDays:30,price:89.9}];
  if (p==='/analytics/vehicles/most-viewed') return {items:cars.slice(0,4).map(v=>({vehicle:v,viewCount:100})),meta:{period:'7d',limit:4,generatedAt:''}};
  if (p==='/admin/overview') return {openReports:3,analytics:{totalSiteVisits:9842,firstTimeVisitors:3120,totalVehicleViews:15230,registeredUsers:1240,registeredListings:386},
    recentUsers:[['Carlos Silva','São Paulo','SP'],['Ana Lima','Rio de Janeiro','RJ'],['Pedro Rocha','Belo Horizonte','MG'],['Julia Costa','Curitiba','PR']].map((x,i)=>({id:'ru'+i,email:x[0].toLowerCase().replace(' ','.')+'@email.com',createdAt:'2026-11-1'+i+'T10:00:00Z',profile:{fullName:x[0],city:x[1],state:x[2]}})),
    recentVehicles:cars.slice(0,5).map((v,i)=>({id:v.id,title:v.title,city:v.city,state:v.state,isActive:i!==3,isPublished:true,createdAt:'2026-11-1'+i+'T10:00:00Z',owner:{email:'dono'+i+'@email.com',profile:{fullName:'Carlos Silva'}}})),
    audit:{total:4,items:[['BLOCK_USER','USER'],['DEACTIVATE_VEHICLE','VEHICLE'],['RESOLVE_REPORT','REPORT'],['ACTIVATE_FEATURED','ORDER']].map((x,i)=>({id:'al'+i,action:x[0],targetType:x[1],targetId:'abc12345-'+i,createdAt:'2026-11-1'+i+'T09:00:00Z',admin:{email:'admin.triluga@triluga.com'}}))}};
  if (p==='/admin/audit-logs') return {total:4,items:[['BLOCK_USER','USER'],['DEACTIVATE_VEHICLE','VEHICLE'],['RESOLVE_REPORT','REPORT'],['ACTIVATE_FEATURED','ORDER']].map((x,i)=>({id:'al'+i,action:x[0],targetType:x[1],targetId:'abc12345-'+i,createdAt:'2026-11-1'+i+'T09:00:00Z',admin:{email:'admin.triluga@triluga.com'}}))};
  if (p==='/admin/reports') return {total:3,items:['FAKE_LISTING','WRONG_PRICE','SPAM'].map((x,i)=>({id:'rp'+i,reason:x,status:i?'OPEN':'RESOLVED',description:'Anúncio com informações suspeitas.',adminNotes:null,createdAt:'2026-11-1'+i+'T09:00:00Z',reporter:{email:'user'+i+'@mail.com',profile:{fullName:'Maria Souza'}},vehicle:{title:cars[i].title}}))};
  if (p==='/admin/featured-orders') return [0,1,2].map(i=>({id:'fo'+i,vehicleId:'v'+i,price:[29.9,89.9,29.9][i],durationDays:[7,30,7][i],status:['PENDING','ACTIVE','EXPIRED'][i],activatedAt:null,expiresAt:'2026-12-10T00:00:00Z',user:{email:'dono'+i+'@email.com'},vehicle:{title:cars[i].title}}));
  if (p==='/admin/privacy/requests') return [0,1].map(i=>({id:'pr'+i,type:['ACCESS','DELETION'][i],status:'OPEN',notes:'Solicito acesso aos meus dados.',createdAt:'2026-11-0'+(i+1)+'T00:00:00Z',updatedAt:'2026-11-0'+(i+1)+'T00:00:00Z',user:{email:'user'+i+'@mail.com',profile:{fullName:'Maria Souza'}}}));
  if (p==='/admin/users') return ['Carlos Silva','Ana Lima','Pedro Rocha','Julia Costa'].map((n,i)=>({id:'au'+i,email:n.toLowerCase().replace(' ','.')+'@email.com',role:'USER',status:i===3?'BLOCKED':'ACTIVE',createdAt:'2026-0'+(i+1)+'-10T00:00:00Z',profile:{fullName:n,city:'São Paulo',state:'SP'}}));
  if (p==='/admin/vehicles') return cars.map((v,i)=>({...v,isActive:i!==3,createdAt:'2026-10-1'+i+'T00:00:00Z',owner:{email:'dono'+i+'@email.com',profile:{fullName:'Carlos Silva'}}}));
  if (p==='/admin/dashboard') return {totals:{users:1240,vehicles:386,privacyRequests:4}};
  if (p==='/admin/users') return [{id:'u2',email:'carlos@x.com',role:'USER',status:'ACTIVE',createdAt:'2026-01-01',profile:{fullName:'Carlos Silva'}}];
  if (p==='/admin/vehicles') return cars;
  if (p==='/reports/count' || p==='/admin/reports/count') return 3;
  if (/^\/(admin\/)?(reports|audit-logs|featured-orders|privacy)/.test(p) || p.includes('/admin/')) return [];
  return [];
}
const PAGES = [
 ['01-home','/'],['02-search','/search'],['03-vehicle-detail','/vehicles/v0'],['04-compare','/compare'],
 ['05-chat','/chat'],['06-chat-conversa','/chat/c0'],['07-favorites','/favorites'],['08-profile','/profile'],
 ['09-user-profile','/users/u2'],['10-anunciar-carro','/anunciar-carro'],['11-admin','/admin'],
 ['12-login','/auth/login'],['13-register','/auth/register'],['14-forgot-password','/auth/forgot-password'],
 ['15-reset-password','/auth/reset-password?token=abc'],['16-verify-email','/auth/verify-email?token=abc'],
 ['17-privacy','/privacy'],['18-privacy-center','/privacy-center'],['19-terms','/terms'],
];
const ONLY=process.env.ONLY?process.env.ONLY.split(','):null;
const EXTRA = [
 ['20-admin-gestao','/admin',async p=>{await p.getByText('Gestão').first().click();}],
 ['21-admin-auditoria','/admin',async p=>{await p.getByText('Auditoria').first().click();}],
 ['22-search-filtros','/search',async p=>{await p.locator('button:has-text("tune"), button[aria-label*=iltro]').locator('visible=true').first().click({timeout:5000});}],
 ['23-anunciar-wizard','/anunciar-carro',async p=>{await p.locator('text=Criar Novo Anúncio >> visible=true').first().click();}],
 ['24-home-menu','/',async p=>{try{await p.locator('button:has-text("menu")').first().click({timeout:2000});}catch{}}],
];
(async()=>{
  const browser = await chromium.launch({proxy:process.env.HTTPS_PROXY?{bypass:'localhost,127.0.0.1',server:process.env.HTTPS_PROXY.replace(/\/\/.*@/,'//'),username:decodeURIComponent((process.env.HTTPS_PROXY.match(/\/\/([^:]*):/)||[])[1]||''),password:decodeURIComponent((process.env.HTTPS_PROXY.match(/\/\/[^:]*:([^@]*)@/)||[])[1]||'')}:undefined});
  const tok = 'x.'+Buffer.from(JSON.stringify({sub:'u1',email:user.email,role:'ADMIN',emailVerified:true})).toString('base64url')+'.y';
  for (const [name,vp,mobile] of [['desktop',{width:1440,height:900},false],['mobile',{width:390,height:844},true]]) {
    const ctx = await browser.newContext({viewport:vp,deviceScaleFactor:1,ignoreHTTPSErrors:true,isMobile:mobile,hasTouch:mobile});
    await ctx.addInitScript(([t,u,c])=>{ try{sessionStorage.setItem('triluga.accessToken',t);sessionStorage.setItem('triluga.user',JSON.stringify(u));sessionStorage.setItem('triluga.sessionHint','1');localStorage.setItem('triluga.sessionHint','1');localStorage.setItem('triluga.privacy.analyticsConsent','denied');}catch{} },[tok,user,cars.slice(0,3)]);
    await ctx.route('**/api/v1/**', r=>{ const q=r.request(); const h={'access-control-allow-origin':B,'access-control-allow-credentials':'true','access-control-allow-headers':'*','access-control-allow-methods':'*'};
      if(q.method()==='OPTIONS') return r.fulfill({status:204,headers:h});
      r.fulfill({status:200,contentType:'application/json',headers:h,body:JSON.stringify(route(q.url(),q.method()))}); });
    await ctx.route(/nominatim|tile\./, r=>r.abort());
    const page = await ctx.newPage();
    if(process.env.DBG){page.on('request',r=>{if(r.url().includes('/api/v1'))console.log(' >',r.method(),r.url().replace(/.*api\/v1/,''))});page.on('console',m=>{if(m.type()==='error')console.log(' ERR',m.text().slice(0,160))});}
    for (const [n,u] of PAGES.filter(p=>!ONLY||ONLY.includes(p[0]))) {
      if(n==='04-compare'||n==='07-favorites'){await page.goto(B+'/',{waitUntil:'networkidle'}).catch(()=>{});await page.evaluate(c=>localStorage.setItem('triluga.compare.vehicles.v2',JSON.stringify(c)),cars.slice(0,3));}
      else await page.evaluate(()=>localStorage.removeItem('triluga.compare.vehicles.v2')).catch(()=>{});
      try { await page.goto(B+u,{waitUntil:'networkidle',timeout:30000}); } catch(e){}
      await page.waitForTimeout(1200);
      if(n==='03-vehicle-detail'){await page.setViewportSize({width:vp.width,height:mobile?3200:2200});await page.waitForTimeout(700);}
      await page.screenshot({path:`${OUT}/${n}-${name}.png`,fullPage:true});
      if(n==='03-vehicle-detail')await page.setViewportSize(vp);
      console.log(name,n,page.url().replace(B,''));
    }
    for (const [n,u,fn] of EXTRA.filter(p=>!ONLY||ONLY.includes(p[0]))) {
      try { await page.goto(B+u,{waitUntil:'networkidle',timeout:30000}); } catch(e){}
      await page.waitForTimeout(800);
      try { await fn(page); } catch(e){ console.log('extra fail',n,e.message.slice(0,80)); }
      await page.waitForTimeout(1000);
      await page.screenshot({path:`${OUT}/${n}-${name}.png`,fullPage:true});
      console.log(name,n);
    }
    await ctx.close();
  }
  await browser.close();
})();
