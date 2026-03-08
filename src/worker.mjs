const APP_VERSION="v0.0.1";
const APP_NAME="pw-hack-demo-app";
const MAX_HASHES=25,RATE_LIMIT_MS=30000,HASHES_CACHE_TTL=5000,INDEX_KEY="__index__";
const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET,POST,DELETE,OPTIONS","Access-Control-Allow-Headers":"Content-Type"};
function json(d,s=200){return new Response(JSON.stringify(d),{status:s,headers:{"Content-Type":"application/json",...CORS}});}
function esc(s=""){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").slice(0,40);}
let _ac=null,_at=0,_hc=null,_ht=0;

// --- Index management (replaces KV list() calls) ---
async function getIndex(env){
    if(!env?.PWDEMOAPPHASHES)return[];
  const raw=await env.PWDEMOAPPHASHES.get(INDEX_KEY);
  if(!raw)return[];
  try{const ids=JSON.parse(raw);return Array.isArray(ids)?ids.filter(id=>!id.startsWith("rl:")):[];
  }catch{return[];}
}
async function saveIndex(env,ids){
  await env.PWDEMOAPPHASHES.put(INDEX_KEY,JSON.stringify(ids),{expirationTtl:7200});
}
async function addToIndex(env,id){
  const idx=await getIndex(env);
  if(!idx.includes(id)){idx.push(id);await saveIndex(env,idx);}
}
async function removeFromIndex(env,id){
  const idx=await getIndex(env);
  const filtered=idx.filter(x=>x!==id);
  if(filtered.length!==idx.length)await saveIndex(env,filtered);
}

// --- Allowlist ---
async function getRules(env){
  if(_ac&&Date.now()-_at<60000)return _ac;
  const r=await env.PWDEMOAPPALLOWLIST.get("rules");
  _ac=parseRules(r||"");_at=Date.now();return _ac;
}
function parseRules(t){
  return t.split("\n").flatMap(l=>{
    l=l.trim();if(!l||l.startsWith("#"))return[];
    const i=l.indexOf(":");if(i<0)return[];
    return[{type:l.slice(0,i).trim(),value:l.slice(i+1).trim()}];
  });
}
function isV6(ip){return ip.includes(":");}
function ip2n(ip){const p=ip.split(".").map(Number);return((p[0]<<24)|(p[1]<<16)|(p[2]<<8)|p[3])>>>0;}
function cidr(ip,c){if(isV6(ip))return false;const[b,bits]=c.split("/");const m=bits?(0xFFFFFFFF<<(32-+bits))>>>0:0xFFFFFFFF;return(ip2n(ip)&m)===(ip2n(b)&m);}
async function allowed(req,env){
  const rules=await getRules(env);if(!rules.length)return true;
  const cf=req.cf??{},ip=req.headers.get("CF-Connecting-IP")??"unknown";
  const ctry=(cf.country??"").toUpperCase(),asn=String(cf.asn??"");
  for(const r of rules){
    if(r.type==="ipv6"&&r.value==="allow"&&isV6(ip))return true;
    if(r.type==="country"&&r.value.toUpperCase()===ctry)return true;
    if(r.type==="ip"&&r.value===ip)return true;
    if(r.type==="cidr"&&cidr(ip,r.value))return true;
    if(r.type==="asn"&&r.value===asn)return true;
  }
  return false;
}
async function rateLimited(ip,env){
  const k="rl:"+ip,l=await env.PWDEMOAPPHASHES.get(k);
  if(l&&Date.now()-+l<RATE_LIMIT_MS)return true;
  await env.PWDEMOAPPHASHES.put(k,String(Date.now()),{expirationTtl:60});return false;
}

// --- Spaces (stored in allowlist KV under key "spaces") ---
const SPACES_KEY="spaces";
async function getSpacesList(env){
  const raw=await env.PWDEMOAPPALLOWLIST.get(SPACES_KEY);
  if(!raw)return[];
  try{return JSON.parse(raw);}catch{return[];}
}
async function saveSpacesList(env,spaces){
  await env.PWDEMOAPPALLOWLIST.put(SPACES_KEY,JSON.stringify(spaces));
}
async function listSpaces(env){return json(await getSpacesList(env));}
async function createOrUpdateSpace(req,env){
  const body=await req.json().catch(()=>null);
  if(!body||typeof body.id!=="string"||!body.id.trim()||typeof body.name!=="string"||!body.name.trim()){
    return json({error:"id and name are required"},400);
  }
  const spaces=await getSpacesList(env);
  const space={id:body.id.trim(),name:body.name.trim(),location:body.location??"unknown",description:body.description??""};
  const idx=spaces.findIndex(s=>s.id===space.id);
  if(idx>=0)spaces[idx]=space;else spaces.push(space);
  await saveSpacesList(env,spaces);
  return json({success:true,space});
}
async function deleteSpace(env,id){
  const spaces=await getSpacesList(env);
  const filtered=spaces.filter(s=>s.id!==id);
  if(filtered.length===spaces.length)return json({error:"Not found"},404);
  await saveSpacesList(env,filtered);
  return json({success:true});
}

// --- Version ---
function version(){
  return json({version:APP_VERSION,name:APP_NAME});
}

// --- Core API ---
async function myIp(req){
  const cf=req.cf??{};
  return json({ip:req.headers.get("CF-Connecting-IP")??"unknown",country:cf.country??"unknown",city:cf.city??"unknown",region:cf.region??"unknown",asn:cf.asn??"unknown",asOrganization:cf.asOrganization??"unknown",timezone:cf.timezone??"unknown",colo:cf.colo??"unknown",httpProtocol:cf.httpProtocol??"unknown",tlsVersion:cf.tlsVersion??"unknown",tlsCipher:cf.tlsCipher??"unknown",userAgent:req.headers.get("User-Agent")??"unknown",acceptLanguage:req.headers.get("Accept-Language")??"unknown"});
}
async function submit(req,env){
  _hc=null;_ht=0;
  if(!await allowed(req,env)){const cf=req.cf??{},ip=req.headers.get("CF-Connecting-IP")??"unknown";return json({error:"Submissions from this IP are blocked.",ip,country:cf.country??"unknown",asn:cf.asn??"unknown",asOrganization:cf.asOrganization??"unknown",hint:"Ask your instructor to add your IP to the allowlist."},403);}
  const ip=req.headers.get("CF-Connecting-IP")??"unknown";
  if(await rateLimited(ip,env))return json({error:"Please wait 30 seconds between submissions."},429);
  const idx=await getIndex(env);
  if(idx.length>=MAX_HASHES)return json({error:"Demo full. Max 25 submissions reached."},429);
  const body=await req.json().catch(()=>null);
  if(!body?.hash||!body?.spaceId)return json({error:"Missing fields: hash and spaceId required."},400);
  if(!/^[a-f0-9]{64}$/i.test(body.hash))return json({error:"Invalid hash. Expected SHA-256 hex."},400);
  const spaces=await getSpacesList(env);
  if(spaces.length>0&&!spaces.some(s=>s.id===body.spaceId))return json({error:"Unknown spaceId."},400);
  const cf=req.cf??{},id=crypto.randomUUID();
  const entry={id,hash:body.hash,spaceId:body.spaceId,submitted:Date.now(),cracked:false,attempts:0,password:null,crackedAt:null,meta:{ip,country:cf.country??"unknown",city:cf.city??"unknown",region:cf.region??"unknown",postalCode:cf.postalCode??"unknown",latitude:cf.latitude??"unknown",longitude:cf.longitude??"unknown",asn:cf.asn??"unknown",asOrganization:cf.asOrganization??"unknown",timezone:cf.timezone??"unknown",colo:cf.colo??"unknown",httpProtocol:cf.httpProtocol??"unknown",tlsVersion:cf.tlsVersion??"unknown",tlsCipher:cf.tlsCipher??"unknown",userAgent:req.headers.get("User-Agent")??"unknown",acceptLanguage:req.headers.get("Accept-Language")??"unknown",referer:req.headers.get("Referer")??"none",rayId:req.headers.get("Cf-Ray")??"unknown",client:body.meta??{}}};
  await env.PWDEMOAPPHASHES.put(id,JSON.stringify(entry),{expirationTtl:7200});
  await addToIndex(env,id);
  return json({id,success:true,slotsLeft:MAX_HASHES-(idx.length+1)});
}
async function hashes(env){
  const now=Date.now();
  if(_hc&&(now-_ht)<HASHES_CACHE_TTL)return json(_hc);
  const idx=await getIndex(env);
  const rows=await Promise.all(idx.map(id=>env.PWDEMOAPPHASHES.get(id,{type:"json"})));
  _hc=rows.filter(Boolean);_ht=now;
  return json(_hc);
}
async function updateHash(req,env,id){
  _hc=null;_ht=0;
  const e=await env.PWDEMOAPPHASHES.get(id,{type:"json"});if(!e)return json({error:"Not found."},404);
  const b=await req.json().catch(()=>({}));
  await env.PWDEMOAPPHASHES.put(id,JSON.stringify({...e,cracked:true,password:esc(b.password??""),attempts:b.attempts??0,crackedAt:Date.now()}),{expirationTtl:7200});
  return json({success:true});
}
async function deleteHash(env,id){
  _hc=null;_ht=0;
  await env.PWDEMOAPPHASHES.delete(id);
  await removeFromIndex(env,id);
  return json({success:true});
}
async function clear(env){
  _hc=null;_ht=0;
  const idx=await getIndex(env);
  await Promise.all(idx.map(id=>env.PWDEMOAPPHASHES.delete(id)));
  await env.PWDEMOAPPHASHES.delete(INDEX_KEY);
  return json({cleared:idx.length});
}
async function getAllowlist(env){return json({rules:await env.PWDEMOAPPALLOWLIST.get("rules")??""});}
async function updateAllowlist(req,env){
  const b=await req.json().catch(()=>null);
  if(typeof b?.rules!=="string")return json({error:"Missing rules."},400);
  await env.PWDEMOAPPALLOWLIST.put("rules",b.rules);_ac=null;return json({success:true});
}

export default{
  async fetch(req,env){
    const url=new URL(req.url),p=url.pathname;
    console.log(`[${APP_NAME}@${APP_VERSION}] ${req.method} ${p}`);
    if(req.method==="OPTIONS")return new Response(null,{status:204,headers:CORS});
    if(p==="/api/version"&&req.method==="GET")return version();
    if(p==="/api/myip"&&req.method==="GET")return myIp(req);
    if(p==="/api/hashes"&&req.method==="GET")return hashes(env);
    if(p==="/api/submit"&&req.method==="POST")return submit(req,env);
    if(p==="/api/clear"&&req.method==="POST")return clear(env);
    if(p==="/api/allowlist"&&req.method==="GET")return getAllowlist(env);
    if(p==="/api/allowlist"&&req.method==="POST")return updateAllowlist(req,env);
    if(p==="/api/spaces"&&req.method==="GET")return listSpaces(env);
    if(p==="/api/spaces"&&req.method==="POST")return createOrUpdateSpace(req,env);
    const mSpace=p.match(/^\/api\/spaces\/([^/]+)$/);
    if(mSpace&&req.method==="DELETE")return deleteSpace(env,mSpace[1]);
    const m=p.match(/^\/api\/hash\/([0-9a-f-]{36})$/i);
    if(m){if(req.method==="POST")return updateHash(req,env,m[1]);if(req.method==="DELETE")return deleteHash(env,m[1]);}
    return new Response("Not found",{status:404});
  }
};
