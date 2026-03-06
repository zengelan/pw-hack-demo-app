const API='/';
async function apiFetch(path,opts={}){
  try{
    const r=await fetch(API+path,{headers:{'Content-Type':'application/json'},...opts});
    const d=await r.json();
    return{ok:r.ok,status:r.status,data:d};
  }catch(e){
    return{ok:false,status:0,data:{error:e.message}};
  }
}
export const api={
  getHashes:()=>apiFetch('api/hashes'),
  getMyIp:()=>apiFetch('api/myip'),
  submit:(hash,spaceId,meta)=>apiFetch('api/submit',{method:'POST',body:JSON.stringify({hash,spaceId,meta})}),
  updateHash:(id,password,attempts)=>apiFetch('api/hash/'+id,{method:'POST',body:JSON.stringify({password,attempts})}),
  deleteHash:(id)=>apiFetch('api/hash/'+id,{method:'DELETE'}),
  clearAll:()=>apiFetch('api/clear',{method:'POST'}),
  getAllowlist:()=>apiFetch('api/allowlist'),
  updateAllowlist:(rules)=>apiFetch('api/allowlist',{method:'POST',body:JSON.stringify({rules})}),
  getSpaces:()=>apiFetch('api/spaces'),
  createSpace:(space)=>apiFetch('api/spaces',{method:'POST',body:JSON.stringify(space)}),
  deleteSpace:(id)=>apiFetch('api/spaces/'+id,{method:'DELETE'}),
};
export function collectClientMeta(){
  return{
    userAgent:navigator.userAgent,
    language:navigator.language,
    languages:[...(navigator.languages||[])],
    platform:navigator.platform,
    cookieEnabled:navigator.cookieEnabled,
    doNotTrack:navigator.doNotTrack,
    screenWidth:screen.width,
    screenHeight:screen.height,
    screenDepth:screen.colorDepth,
    devicePixelRatio:window.devicePixelRatio,
    timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,
    timezoneOffset:new Date().getTimezoneOffset(),
    hardwareConcurrency:navigator.hardwareConcurrency,
    maxTouchPoints:navigator.maxTouchPoints,
    online:navigator.onLine,
    connection:navigator.connection?{type:navigator.connection.effectiveType,downlink:navigator.connection.downlink}:null,
    windowWidth:window.innerWidth,
    windowHeight:window.innerHeight,
    referrer:document.referrer,
    submittedAt:new Date().toISOString(),
  };
}
