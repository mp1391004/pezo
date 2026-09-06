require('dotenv').config({ path: '.env.local' });
require('dotenv').config();
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const fs = require('fs');
const os = require('os');
const db = require('./lib/db');
const { readVault } = require('./lib/vault');
const toolEngine = require('./lib/tool-engine');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const BASE = (process.env.PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const vault = readVault();
const STORAGE = process.env.STORAGE_DIR || (process.env.NODE_ENV === 'production' ? path.join(os.homedir(),'pezo-storage') : path.join(__dirname,'data'));
fs.mkdirSync(path.join(STORAGE,'uploads'),{recursive:true});
const runtimePath=path.join(STORAGE,'runtime-config.json');
let runtime={};try{runtime=JSON.parse(fs.readFileSync(runtimePath,'utf8'))}catch{}
const siteBase=()=>String(process.env.PUBLIC_URL||runtime.publicUrl||BASE).replace(/\/$/,'');
const cfg = {
  adminEmail: process.env.ADMIN_EMAIL || runtime.adminEmail || 'minhphuongmp139@gmail.com',
  adminPassword: vault.admin_password || runtime.adminPassword || '',
  payosClient: process.env.PAYOS_CLIENT_ID || vault.payos_client_id || runtime.payosClient || '',
  payosApi: process.env.PAYOS_API_KEY || vault.payos_api_key || runtime.payosApi || '',
  payosChecksum: process.env.PAYOS_CHECKSUM_KEY || vault.payos_checksum_key || runtime.payosChecksum || '',
  googleClient: process.env.GOOGLE_CLIENT_ID || vault.google_client_id || runtime.googleClient || '',
  googleSecret: process.env.GOOGLE_CLIENT_SECRET || vault.google_client_secret || runtime.googleSecret || ''
};
let JWT_SECRET = process.env.JWT_SECRET || runtime.jwtSecret || crypto.createHash('sha256').update(cfg.adminPassword + '|pezo-local-session').digest('hex');
const SETUP_TOKEN=process.env.SETUP_TOKEN||'';
const defaults = {
  'brand.name':'Pezo','contact.zalo':'','video.url':'','dashboard.url':'/workspace',
  'img.logo':'/pezo-logo.svg','img.favicon':'/pezo-logo.svg','img.zalo':'','img.input':'/pezo-input.png','img.output':'/pezo-output.png',
  'site.title':'Pezo — Từ transcript Zoom đến nội dung và ảnh hoàn chỉnh',
  'site.desc':'Pezo biến transcript Zoom thành nội dung có cấu trúc và ảnh minh họa đồng bộ trong khoảng 300 giây.'
};
const contentDefaults = {
  'hero.badge':'Chạy bằng API bạn đang dùng',
  'hero.title':'Từ transcript Zoom thành nội dung + ảnh trong khoảng 300 giây.',
  'hero.description':'Đưa nhiều transcript vào Pezo. Nhận lại nội dung đã được sắp xếp logic, ảnh minh họa đồng bộ theo theme và một folder sẵn sàng đưa lên web.',
  'hero.cta':'Mua Pezo — 99.000đ',
  'pain.eyebrow':'Việc sau buổi Zoom',
  'pain.title':'Video đã quay xong. Nhưng công việc vẫn còn cả vài giờ.',
  'pain.description':'Bạn cần biến lời nói thành tài liệu mạch lạc, chọn chỗ cần minh họa rồi giữ mọi thứ đồng nhất qua cả loạt video.',
  'workflow.eyebrow':'Một quy trình duy nhất',
  'workflow.title':'Transcript vào. Folder hoàn chỉnh đi ra.',
  'workflow.description':'Pezo xử lý cả phần chữ lẫn phần hình và giữ chúng cùng một hướng trình bày.',
  'showcase.eyebrow':'Nhìn thấy kết quả',
  'showcase.title':'Không chỉ viết lại transcript.',
  'showcase.description':'Pezo cho bạn rà soát nội dung, xem ảnh minh họa ngay cạnh từng phần và tải toàn bộ thành một folder.',
  'audience.eyebrow':'Pezo dành cho ai?',
  'audience.title':'Cho người biến kiến thức thành chương trình.',
  'audience.description':'Nếu công việc của bạn bắt đầu bằng một buổi chia sẻ và kết thúc bằng tài liệu cho người học, Pezo giúp rút ngắn đoạn giữa.',
  'pricing.eyebrow':'Mức phí trải nghiệm',
  'pricing.title':'Một lần thanh toán. Dùng Pezo trọn đời.',
  'pricing.description':'Pezo lấy mức phí tượng trưng. Bạn tự dùng API của mình và trả trực tiếp cho bên cung cấp theo lượng sử dụng.',
  'pricing.price':'99.000đ',
  'pricing.cta':'Mua Pezo — 99.000đ',
  'pricing.api':'Về chi phí API — tôi nói thẳng: Pezo dùng API key của chính bạn. Bạn điền key vào, dùng bao nhiêu thì trả cho bên cung cấp API bấy nhiêu — tiền đó không qua tay tôi. Phần tôi lấy chỉ là 99.000đ phí tool, một lần duy nhất.',
  'pricing.policy':'Nói trước cho rõ: không có bản dùng thử và không hoàn tiền. Giá để ở mức 99.000đ chính là để bạn thử mà không phải cân nhắc nhiều. Bạn đọc kỹ trang này, thấy hợp thì mua.',
  'final.title':'Buổi Zoom tiếp theo của bạn là tuần tới. Bài viết thì sao?',
  'final.description':'Bạn có thể mở bảy cái tab, dán transcript, copy mô tả ảnh qua lại, và hết thêm một buổi chiều nữa. Hoặc dán vào Pezo và quay lại sau 5 phút.',
  'final.cta':'Mua Pezo — 99.000đ trọn đời',
  'footer.description':'Từ transcript Zoom đến nội dung và hình ảnh sẵn sàng lên web.'
};
let ready;
async function boot(){ if(!ready) ready=(async()=>{ await db.init(); for(const [k,v] of Object.entries(defaults)) if(!await db.hasKey('settings',k)) await db.setSetting(k,v); for(const [k,v] of Object.entries(contentDefaults)) if(!await db.hasKey('content',k)) await db.q('INSERT INTO content(key,value) VALUES($1,$2)',[k,v]); if(!await db.getSetting('admin.pw') && cfg.adminPassword) await db.setSetting('admin.pw',db.makePw(cfg.adminPassword)); })(); return ready; }

app.disable('x-powered-by'); app.set('trust proxy',1);
app.use(express.json({limit:'8mb'})); app.use(express.urlencoded({extended:true})); app.use(cookieParser());
app.use((req,res,next)=>{ res.set({'X-Content-Type-Options':'nosniff','X-Frame-Options':'SAMEORIGIN','Referrer-Policy':'strict-origin-when-cross-origin','Permissions-Policy':'camera=(), microphone=(), geolocation=()'}); if(req.path.startsWith('/admin')||req.path.startsWith('/api')) res.set('X-Robots-Tag','noindex, nofollow'); next(); });
app.use(async(req,res,next)=>{try{await boot();next()}catch(e){res.status(500).send('Pezo chưa mở được dữ liệu.');}});

const sign=(payload,age='7d')=>jwt.sign(payload,JWT_SECRET,{expiresIn:age});
function admin(req,res,next){try{req.admin=jwt.verify(req.cookies.pezo_admin,JWT_SECRET);next()}catch{return res.status(401).json({error:'unauthorized'})}}
function buyer(req,res,next){try{req.buyer=jwt.verify(req.cookies.pezo_buyer,JWT_SECRET);next()}catch{return res.redirect('/api/auth/google')}}
async function hasToolAccess(email){const normalized=String(email||'').trim().toLowerCase();if(normalized===cfg.adminEmail.trim().toLowerCase())return true;const u=await db.one('SELECT paid FROM users WHERE lower(email)=lower($1)',[normalized]);return !!u?.paid}
async function paidBuyer(req,res,next){try{req.buyer=jwt.verify(req.cookies.pezo_buyer,JWT_SECRET);if(!await hasToolAccess(req.buyer.email))return res.status(403).json({detail:'Tài khoản chưa được mở quyền.'});next()}catch{return res.status(401).json({detail:'Bạn cần đăng nhập lại.'})}}
const wrap=fn=>(req,res)=>Promise.resolve(fn(req,res)).catch(e=>{console.error(e.message);if(!res.headersSent)res.status(500).json({error:'Có lỗi kết nối. Vui lòng thử lại.'})});
app.post('/api/setup',wrap(async(req,res)=>{if(!SETUP_TOKEN)return res.status(404).end();if(fs.existsSync(path.join(STORAGE,'.setup-complete')))return res.status(410).json({error:'setup locked'});if(req.get('authorization')!==`Bearer ${SETUP_TOKEN}`)return res.status(401).json({error:'unauthorized'});const b=req.body||{};const required=['adminPassword','payosClient','payosApi','payosChecksum','googleClient','googleSecret','jwtSecret','publicUrl'];if(!required.every(k=>String(b[k]||'').length>=8))return res.status(400).json({error:'missing'});runtime={...b,adminEmail:'minhphuongmp139@gmail.com'};fs.writeFileSync(runtimePath,JSON.stringify(runtime),{mode:0o600});fs.writeFileSync(path.join(STORAGE,'.setup-complete'),'ok',{mode:0o600});Object.assign(cfg,runtime);JWT_SECRET=runtime.jwtSecret;await db.setSetting('admin.pw',db.makePw(runtime.adminPassword));res.json({ok:true})}));

app.post('/api/admin/login',wrap(async(req,res)=>{const email=String(req.body.email||'').trim().toLowerCase(),pw=String(req.body.password||'');const stored=await db.getSetting('admin.pw');if(email!==cfg.adminEmail.toLowerCase()||!db.checkPw(pw,stored))return res.status(401).json({error:'Sai email hoặc mật khẩu.'});res.cookie('pezo_admin',sign({role:'admin',email}),{httpOnly:true,sameSite:'lax',secure:siteBase().startsWith('https'),maxAge:604800000});res.json({ok:true,tempPassword:false})}));
app.post('/api/admin/logout',(req,res)=>{res.clearCookie('pezo_admin');res.json({ok:true})});
app.get('/api/admin/me',admin,(req,res)=>res.json({email:req.admin.email,tempPassword:false}));
app.post('/api/admin/password',admin,wrap(async(req,res)=>{if(!db.checkPw(String(req.body.current||''),await db.getSetting('admin.pw')))return res.status(400).json({error:'Mật khẩu hiện tại chưa đúng.'});if(String(req.body.next||'').length<8)return res.status(400).json({error:'Mật khẩu mới cần ít nhất 8 ký tự.'});await db.setSetting('admin.pw',db.makePw(req.body.next));res.json({ok:true})}));

app.get('/api/auth/google',(req,res)=>{if(!cfg.googleClient)return res.status(503).send('Google Login chưa được cấu hình.');const base=siteBase(),state=crypto.randomBytes(24).toString('hex');res.cookie('pezo_oauth_state',state,{httpOnly:true,sameSite:'lax',secure:base.startsWith('https'),maxAge:600000});const u=new URL('https://accounts.google.com/o/oauth2/v2/auth');u.search=new URLSearchParams({client_id:cfg.googleClient,redirect_uri:base+'/api/auth/callback/google',response_type:'code',scope:'openid email profile',state,prompt:'select_account'});res.redirect(u.toString())});
app.get('/api/auth/callback/google',wrap(async(req,res)=>{if(!req.query.code||!req.query.state||req.query.state!==req.cookies.pezo_oauth_state)return res.status(400).send('Phiên đăng nhập không hợp lệ.');const base=siteBase();const token=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code:req.query.code,client_id:cfg.googleClient,client_secret:cfg.googleSecret,redirect_uri:base+'/api/auth/callback/google',grant_type:'authorization_code'})}).then(r=>r.json());if(!token.access_token)return res.status(401).send('Google chưa xác nhận đăng nhập.');const profile=await fetch('https://openidconnect.googleapis.com/v1/userinfo',{headers:{authorization:'Bearer '+token.access_token}}).then(r=>r.json());if(!profile.email)return res.status(401).send('Không lấy được email Google.');await db.q('INSERT INTO users(email,name,google_id) VALUES($1,$2,$3) ON CONFLICT(email) DO UPDATE SET name=EXCLUDED.name,google_id=EXCLUDED.google_id',[profile.email,profile.name||'',profile.sub||'']);res.clearCookie('pezo_oauth_state');res.cookie('pezo_buyer',sign({email:profile.email,name:profile.name||''}),{httpOnly:true,sameSite:'lax',secure:base.startsWith('https'),maxAge:2592000000});res.redirect('/checkout')}));

function hmac(data){return crypto.createHmac('sha256',cfg.payosChecksum).update(data).digest('hex')}
function webhookString(data){return Object.keys(data).sort().filter(k=>data[k]!==undefined).map(k=>{let v=data[k];if(Array.isArray(v))v=JSON.stringify(v.map(x=>Object.keys(x).sort().reduce((o,a)=>(o[a]=x[a],o),{})));if(v===null||v===undefined||v==='null'||v==='undefined')v='';return `${k}=${v}`}).join('&')}
app.get('/checkout',buyer,wrap(async(req,res)=>{const existing=await db.one('SELECT paid FROM users WHERE email=$1',[req.buyer.email]);if(existing?.paid)return res.redirect('/workspace');if(!cfg.payosClient||!cfg.payosApi||!cfg.payosChecksum)return res.status(503).send('PayOS chưa được cấu hình.');const orderCode=Number(String(Date.now()).slice(-10));const amount=99000,description=`PEZO ${orderCode}`.slice(0,25),base=siteBase(),cancelUrl=base+'/?payment=cancel',returnUrl=base+'/payment/success';const data=`amount=${amount}&cancelUrl=${cancelUrl}&description=${description}&orderCode=${orderCode}&returnUrl=${returnUrl}`;const payload={orderCode,amount,description,buyerName:req.buyer.name,buyerEmail:req.buyer.email,items:[{name:'Pezo trọn đời',quantity:1,price:amount}],cancelUrl,returnUrl,signature:hmac(data)};const out=await fetch('https://api-merchant.payos.vn/v2/payment-requests',{method:'POST',headers:{'content-type':'application/json','x-client-id':cfg.payosClient,'x-api-key':cfg.payosApi},body:JSON.stringify(payload)}).then(r=>r.json());if(out.code!=='00'||!out.data?.checkoutUrl)return res.status(502).send('Chưa tạo được mã thanh toán.');await db.q('INSERT INTO orders(order_code,email,amount,status,payment_link_id) VALUES($1,$2,$3,$4,$5)',[orderCode,req.buyer.email,amount,'PENDING',out.data.paymentLinkId||'']);res.redirect(out.data.checkoutUrl)}));
app.get('/payment/success',buyer,wrap(async(req,res)=>{const code=Number(req.query.orderCode);if(code){const order=await db.one('SELECT * FROM orders WHERE order_code=$1 AND email=$2',[code,req.buyer.email]);if(order){const out=await fetch(`https://api-merchant.payos.vn/v2/payment-requests/${code}`,{headers:{'x-client-id':cfg.payosClient,'x-api-key':cfg.payosApi}}).then(r=>r.json());if(out.data?.status==='PAID'){await db.q("UPDATE orders SET status='PAID' WHERE order_code=$1",[code]);await db.q('UPDATE users SET paid=1 WHERE email=$1',[req.buyer.email]);}}}res.redirect('/workspace')}));
app.post('/api/payos/webhook',wrap(async(req,res)=>{const b=req.body||{};if(!b.data||!b.signature||hmac(webhookString(b.data))!==b.signature)return res.status(400).json({success:false});if(b.success&&b.data.code==='00'){const order=await db.one('SELECT * FROM orders WHERE order_code=$1',[Number(b.data.orderCode)]);if(order&&Number(b.data.amount)===order.amount){await db.q("UPDATE orders SET status='PAID' WHERE order_code=$1",[order.order_code]);await db.q('UPDATE users SET paid=1 WHERE email=$1',[order.email]);}}res.json({success:true})}));

app.get('/workspace',buyer,wrap(async(req,res)=>{if(!await hasToolAccess(req.buyer.email))return res.redirect('/checkout');const url=await db.getSetting('dashboard.url','/workspace');if(url&&url!=='/workspace')return res.redirect(url);res.sendFile(path.join(__dirname,'public','tool','index.html'))}));
app.get('/tool/result.html',paidBuyer,(req,res)=>res.sendFile(path.join(__dirname,'public','tool','result.html')));
app.get('/api/buyer/me',async(req,res)=>{try{const u=jwt.verify(req.cookies.pezo_buyer,JWT_SECRET);res.json({loggedIn:true,paid:await hasToolAccess(u.email)})}catch{res.json({loggedIn:false,paid:false})}});
toolEngine.mount(app,{storage:STORAGE,paidBuyer});
app.get('/api/site',wrap(async(req,res)=>{const settings={},content={};for(const k of Object.keys(defaults))settings[k]=await db.getSetting(k,defaults[k]);for(const r of await db.q('SELECT key,value FROM content'))content[r.key]=r.value;res.json({settings,content})}));
app.post('/api/visit',wrap(async(req,res)=>{await db.q('INSERT INTO visits(path,ua) VALUES($1,$2)',[String(req.body?.path||'/').slice(0,200),String(req.headers['user-agent']||'').slice(0,200)]);res.json({ok:true})}));
app.get('/api/admin/stats',admin,wrap(async(req,res)=>{const n=async sql=>Number((await db.one(sql))?.n||0);res.json({leads:await n('SELECT COUNT(*) n FROM users'),newLeads:await n("SELECT COUNT(*) n FROM orders WHERE status='PENDING'"),leads7:await n("SELECT COUNT(*) n FROM orders WHERE status='PAID'"),visits:await n('SELECT COUNT(*) n FROM visits'),leadsTest:0,daily:[],byPack:[]})}));
app.get('/api/admin/leads',admin,wrap(async(req,res)=>res.json(await db.q("SELECT id,name,email,'' phone,'Pezo trọn đời' pack,'' flavour,CASE WHEN paid=1 THEN 'won' ELSE 'new' END status,'' note,0 is_test,created_at FROM users ORDER BY id DESC"))));
app.post('/api/admin/users/:id/access',admin,wrap(async(req,res)=>{
  const id=Number(req.params.id);
  if(!Number.isSafeInteger(id)||id<1||typeof req.body?.paid!=='boolean')return res.status(400).json({error:'Yêu cầu cấp quyền không hợp lệ.'});
  const found=await db.one('SELECT id,email FROM users WHERE id=$1',[id]);
  if(!found)return res.status(404).json({error:'Không tìm thấy khách hàng.'});
  await db.q('UPDATE users SET paid=$1 WHERE id=$2',[req.body.paid?1:0,id]);
  res.json({ok:true,paid:req.body.paid,email:found.email});
}));
app.get('/api/admin/content',admin,wrap(async(req,res)=>{const out={};for(const r of await db.q('SELECT key,value FROM content ORDER BY key'))out[r.key]=r.value;res.json(out)}));
function safeUrl(v){v=String(v||'').trim();return /^(https?:|mailto:|tel:|\/|data:image\/)/i.test(v)?v:''}
function sanitizeHtml(input){let html=String(input||'').replace(/<!--[\s\S]*?-->/g,'').replace(/<(script|style|iframe|object|embed|form|svg)[\s\S]*?<\/\1\s*>/gi,'').replace(/<(script|style|iframe|object|embed|form|svg)\b[^>]*\/?>/gi,'');const allowed={p:[],br:[],b:[],strong:[],i:[],em:[],u:[],h1:[],h2:[],h3:[],h4:[],ul:[],ol:[],li:[],blockquote:[],div:[],span:[],a:['href'],img:['src','alt']};return html.replace(/<(\/?)([a-zA-Z0-9]+)((?:\s[^>]*)?)\/?>/g,(all,close,raw,attrs)=>{const tag=raw.toLowerCase(),ok=allowed[tag];if(!ok)return'';if(close)return`</${tag}>`;const kept=[];for(const m of attrs.matchAll(/([a-zA-Z-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)){const name=m[1].toLowerCase();if(!ok.includes(name))continue;let val=m[3]??m[4]??'';if((name==='href'||name==='src')&&!(val=safeUrl(val)))continue;kept.push(`${name}="${val.replace(/"/g,'&quot;')}"`)}if(tag==='a'){const h=kept.find(x=>x.startsWith('href='));return h?`<a ${h} target="_blank" rel="noopener noreferrer">`:''}if(tag==='img'){const s=kept.find(x=>x.startsWith('src='));return s?`<img ${s} ${kept.find(x=>x.startsWith('alt='))||'alt=""'}>`:''}return kept.length?`<${tag} ${kept.join(' ')}>`:`<${tag}>`}).trim()}
app.put('/api/admin/content',admin,wrap(async(req,res)=>{for(const [k,v] of Object.entries(req.body||{})){if(!/^section\.[a-z0-9_-]+$/.test(k)&&!Object.hasOwn(contentDefaults,k))continue;const clean=sanitizeHtml(v).slice(0,50000);if(await db.hasKey('content',k))await db.q('UPDATE content SET value=$1 WHERE key=$2',[clean,k]);else await db.q('INSERT INTO content(key,value) VALUES($1,$2)',[k,clean]);}res.json({ok:true})}));
app.get('/api/admin/settings',admin,wrap(async(req,res)=>{const out={'admin.email':cfg.adminEmail};for(const k of Object.keys(defaults))out[k]=await db.getSetting(k,defaults[k]);res.json(out)}));
app.put('/api/admin/settings',admin,wrap(async(req,res)=>{for(const k of Object.keys(defaults))if(Object.hasOwn(req.body,k))await db.setSetting(k,String(req.body[k]).replace(/<[^>]*>/g,'').slice(0,2000));res.json({ok:true})}));
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:25*1024*1024}});
function realType(b){if(b.subarray(0,3).equals(Buffer.from([0xff,0xd8,0xff])))return['.jpg','image'];if(b.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])))return['.png','image'];if(b.subarray(0,6).toString().startsWith('GIF8'))return['.gif','image'];if(b.subarray(0,4).toString()==='RIFF'&&b.subarray(8,12).toString()==='WEBP')return['.webp','image'];if(b.subarray(4,12).toString().includes('ftypavif'))return['.avif','image'];if(b.subarray(4,12).toString().includes('ftyp'))return['.mp4','video'];if(b.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3])))return['.webm','video'];return null}
app.post('/api/admin/upload-image',admin,wrap(async(req,res)=>{const key=String(req.body?.key||''),raw=String(req.body?.data||'');if(!key.startsWith('img.')||!Object.hasOwn(defaults,key))return res.status(400).json({error:'Ô tải ảnh không hợp lệ.'});const match=raw.match(/^data:image\/[a-z0-9.+-]+;base64,([A-Za-z0-9+/=]+)$/i);if(!match)return res.status(400).json({error:'Ảnh gửi lên không hợp lệ.'});const buffer=Buffer.from(match[1],'base64');if(!buffer.length||buffer.length>5*1024*1024)return res.status(400).json({error:'Ảnh cần nhỏ hơn 5MB.'});const type=realType(buffer);if(!type||type[1]!=='image')return res.status(400).json({error:'Chỉ nhận PNG, JPG, GIF, WebP hoặc AVIF.'});const name=crypto.randomBytes(12).toString('hex')+type[0];fs.writeFileSync(path.join(STORAGE,'uploads',name),buffer);const url='/uploads/'+name;await db.setSetting(key,url);res.json({ok:true,url})}));
app.post('/api/admin/upload',admin,upload.single('file'),wrap(async(req,res)=>{if(!req.file)return res.status(400).json({error:'Bạn chưa chọn tệp.'});const type=realType(req.file.buffer);if(!type)return res.status(400).json({error:'Tệp không đúng định dạng cho phép.'});if(type[1]==='image'&&req.file.size>5*1024*1024)return res.status(400).json({error:'Ảnh cần nhỏ hơn 5MB.'});if(type[1]==='video'&&req.body.key!=='video.url')return res.status(400).json({error:'Ô này chỉ nhận ảnh.'});const name=crypto.randomBytes(12).toString('hex')+type[0];fs.writeFileSync(path.join(STORAGE,'uploads',name),req.file.buffer);const url='/uploads/'+name;if(Object.hasOwn(defaults,req.body.key))await db.setSetting(req.body.key,url);res.json({ok:true,url})}));
app.delete('/api/admin/upload',admin,wrap(async(req,res)=>{const key=String(req.query.key||'');if(Object.hasOwn(defaults,key))await db.setSetting(key,defaults[key]);res.json({ok:true})}));
app.use('/uploads',express.static(path.join(STORAGE,'uploads'))); app.use(express.static(path.join(__dirname,'public'),{extensions:['html']}));
app.get('/robots.txt',(req,res)=>res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\n\nSitemap: ${siteBase()}/sitemap.xml\n`));
app.get('/sitemap.xml',(req,res)=>res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${siteBase()}/</loc></url></urlset>`));
app.get('/admin',(req,res)=>res.sendFile(path.join(__dirname,'public','admin.html')));
app.get('/healthz',wrap(async(req,res)=>res.json({ok:true,database:'ok',vault:{admin:!!cfg.adminPassword,payos:!!(cfg.payosClient&&cfg.payosApi&&cfg.payosChecksum),google:!!(cfg.googleClient&&cfg.googleSecret)}})));
app.listen(PORT,()=>console.log(`Pezo ready: ${BASE}`));
