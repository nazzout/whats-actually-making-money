// Ported from docs/legacy/making-money.html (handoff v2). Kept close to the original so the design matches exactly.
// Only the data layer (boot section at the bottom) differs.
export function mountApp(opts){
const OPT={
  aiRole:["Native","Engine","Feature","None"],
  digital:["Fully digital","Digital-led","Digitally distributed","Digitally enabled","Non-digital"],
  form:["Mobile app","Web app/site","Desktop software","Game","API/infrastructure","Marketplace/platform","Content/media","Physical product","Hardware + software","Service","Hybrid"],
  customer:["B2C","B2B","Prosumer","C2C/marketplace","B2B/Prosumer"],
  model:["Subscription","Usage","Take rate","One-time purchase","Ads","Retainer/project fees","Licensing","Subscription + usage","One-time + subscription"],
  metricType:["Revenue","ARR","Annualized run-rate","Net income","Adj. EBITDA","Free cash flow","GMV","Gross consumer spend","Units","Users","Third-party estimate","Acquisition price"],
  tier:["Audited filing","Regulatory/acquirer filing","Company financial statements","Reputable press","Third-party analytics","Company-reported","Founder post"],
  flags:["Hit-dependent","Decelerating","Conflicting figures","Metric-type risk","Customer concentration","Pending disclosure"],
  industry:["Software","Developer tools","Productivity","Consumer","Gaming","Entertainment","Media","Advertising","Creative services","Commerce","Health","Finance","Hardware","Consumer goods","Marketplaces","Services","Other"]
};
const DIMS=[["scale","Scale"],["growth","Growth"],["profit","Profitability"],["efficiency","Efficiency"],["durability","Durability"]];
const WEIGHT={5:1,4:.9,3:.75,2:.55,1:.3,0:0};
const ROLE_C={Native:"var(--native)",Engine:"var(--engine)",Feature:"var(--feature)",None:"var(--none)"};
const roleName=r=>r==="None"?"No AI":"AI "+(r||"").toLowerCase();
const $=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const safeUrl=u=>/^https?:\/\//i.test(u||"")?u:"";
const num=v=>Math.max(0,Math.min(5,Number(v)||0));
const reduce=matchMedia("(prefers-reduced-motion: reduce)").matches;

let db=null,sample=null,canWrite=false,items=[],sortKey="signal",groupKey="aiRole";
let highlight=null; // {ids:Set} or null

const initial=n=>esc((String(n||"?").match(/[\p{L}\p{N}]/u)||["?"])[0].toUpperCase());
// Logos: an explicit `icon` wins; otherwise Brandfetch Logo API (free, must be hotlinked, never cached) from the company website.
// Store pages (Steam, App Store) would return the store's logo, so those keep the letter tile. Missing logos 404 and fall back to the letter tile.
const STORE_HOSTS=/(^|\.)(steampowered\.com|apple\.com|google\.com|epicgames\.com|itch\.io|gog\.com)$/i;
// Games listed by their Steam page get the Steam logo (white, so it sits on Steam's dark navy). An explicit icon still wins.
const STEAM_ICON="/icons/steam.png";
const isSteam=d=>{try{return /(^|\.)steampowered\.com$/i.test(new URL(d.website).hostname)}catch{return false}};
const logoSrc=d=>{
  if(d.icon&&(/^https:\/\//i.test(d.icon)||!/^[a-z]+:/i.test(d.icon)))return d.icon;
  if(d.website&&isSteam(d))return STEAM_ICON;
  if(!opts.brandfetchId||!d.website)return "";
  let h;try{h=new URL(d.website).hostname.replace(/^www\./,"")}catch{return ""}
  if(STORE_HOSTS.test(h))return "";
  return `https://cdn.brandfetch.io/domain/${encodeURIComponent(h)}/w/256/h/256/fallback/404/icon?c=${encodeURIComponent(opts.brandfetchId)}`;
};
const icoHTML=(d,cls)=>{const src=logoSrc(d);return `<span class="${cls}${src===STEAM_ICON?" ico-steam":""}" aria-hidden="true" data-ini="${initial(d.name)}">${src?`<img src="${esc(src)}" alt="" loading="lazy" draggable="false">`:initial(d.name)}</span>`};
document.addEventListener("error",e=>{const t=e.target;if(t.tagName==="IMG"&&t.parentElement?.dataset.ini){t.parentElement.textContent=t.parentElement.dataset.ini}},true);
function derive(d){const s=d.scores||{};const strength=DIMS.reduce((a,[k])=>a+num(s[k]),0);const conf=num(d.confidence);return {...d,strength,confidence:conf,signal:+(strength*WEIGHT[conf]).toFixed(1),included:conf>=2&&strength>=12}}

/* ---------- routing ---------- */
function route(){
  const board=location.hash==="#board";
  if($("#sheet").classList.contains("on")&&!window._keepSheet)closeSheet();
  $("#explore").hidden=board; $("#board").hidden=!board;
  document.body.classList.toggle("board-mode",board);
  const on=board?$("#tabBoard"):$("#tabExplore"), off=board?$("#tabExplore"):$("#tabBoard");
  on.setAttribute("aria-current","page"); off.removeAttribute("aria-current");
  if(!board){document.activeElement?.blur?.();requestAnimationFrame(()=>{buildField();});}
  window.scrollTo(0,0);
  // The nav is shorter on the board (no brand pill), so re-measure where the pinned search bar sits.
  requestAnimationFrame(()=>{setNavH();updateDock();if(!board)requestAnimationFrame(pinExplore)});
}
addEventListener("hashchange",route);
// iOS Safari ignores user-scalable=no, so block pinch gestures directly.
["gesturestart","gesturechange","gestureend"].forEach(t=>document.addEventListener(t,e=>e.preventDefault(),{passive:false}));
document.addEventListener("touchmove",e=>{if(e.touches.length>1)e.preventDefault()},{passive:false});

/* ---------- liquid green: AI metric cards ---------- */
const Liquid=(()=>{
  const RW=176,RH=116,N=6,st=new WeakMap();
  let gl=null,u={},els=[],rafL=null;const t0=performance.now();
  const VS="attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}";
  const FS=`precision mediump float;
uniform vec2 res;uniform float t,seed;uniform vec4 m[${N}];
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+1.),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;mat2 r=mat2(.8,.6,-.6,.8);for(int i=0;i<4;i++){v+=a*n(p);p=r*p*2.02;a*=.5;}return v;}
void main(){
  float asp=res.x/res.y;vec2 uv=gl_FragCoord.xy/res;
  vec2 p=vec2(uv.x*asp,uv.y)*1.4+seed;vec2 disp=vec2(0.);
  for(int i=0;i<${N};i++){vec2 mp=vec2(m[i].x*asp,m[i].y)*1.4+seed;vec2 d=p-mp;float f=exp(-dot(d,d)*5.);disp+=m[i].zw*f+vec2(-d.y,d.x)*length(m[i].zw)*f*.8;}
  p-=disp;float T=t*.12;
  vec2 q=vec2(fbm(p+vec2(0.,T)),fbm(p+vec2(5.2,1.3)-T));
  vec2 r=vec2(fbm(p+3.*q+vec2(1.7,9.2)+T*1.3),fbm(p+3.*q+vec2(8.3,2.8)-T));
  float v=fbm(p+3.*r);
  vec3 deep=vec3(0.,.29,.12),mid=vec3(0.,.46,.19),bright=vec3(.03,.62,.27),glow=vec3(.32,.8,.52);
  vec3 c=mix(deep,mid,smoothstep(.2,.55,v));
  c=mix(c,bright,smoothstep(.5,.78,v+.15*q.x));
  c=mix(c,glow,smoothstep(.6,1.,v+length(disp)*.5)*.38);
  gl_FragColor=vec4(c,1.);
}`;
  try{
    const cv=document.createElement("canvas");cv.width=RW;cv.height=RH;
    gl=cv.getContext("webgl",{antialias:false,alpha:false,preserveDrawingBuffer:true});
    if(gl){
      const sh=(type,src)=>{const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw 0;return s};
      const pr=gl.createProgram();gl.attachShader(pr,sh(gl.VERTEX_SHADER,VS));gl.attachShader(pr,sh(gl.FRAGMENT_SHADER,FS));gl.linkProgram(pr);
      if(!gl.getProgramParameter(pr,gl.LINK_STATUS))throw 0;
      gl.useProgram(pr);
      gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer());gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
      const a=gl.getAttribLocation(pr,"a");gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,2,gl.FLOAT,false,0,0);
      ["res","t","seed","m"].forEach(k=>u[k]=gl.getUniformLocation(pr,k));
      gl.viewport(0,0,RW,RH);gl.uniform2f(u.res,RW,RH);
    }
  }catch{gl=null}
  const buf=new Float32Array(N*4);
  function draw(c,now){
    const s=st.get(c);if(!s||!s.ctx)return;
    buf.fill(0);s.pts.forEach((p,i)=>{buf.set([p.x,p.y,p.vx*6,p.vy*6],i*4)});
    gl.uniform1f(u.t,reduce?8:(now-t0)/1000);gl.uniform1f(u.seed,s.seed);gl.uniform4fv(u.m,buf);
    gl.drawArrays(gl.TRIANGLE_STRIP,0,4);s.ctx.drawImage(gl.canvas,0,0);
  }
  function frame(now){
    rafL=null;if(!gl||gl.isContextLost()||$("#explore").hidden)return;
    const vw=innerWidth,vh=innerHeight;let live=0;
    for(const c of els){
      if(!c.isConnected)continue;live++;
      const s=st.get(c);s.pts.forEach(p=>{p.vx*=.955;p.vy*=.955});
      const r=c.getBoundingClientRect();if(r.right<0||r.left>vw||r.bottom<0||r.top>vh)continue;
      draw(c,now);
    }
    if(live)rafL=requestAnimationFrame(frame);
  }
  return {
    ok:!!gl,
    attach(root){
      if(!gl||!root)return;
      els=[...root.querySelectorAll("canvas.lq")];
      els.forEach((c,i)=>{c.width=RW;c.height=RH;st.set(c,{seed:(i*7.31)%40,pts:[],last:null,ctx:c.getContext("2d")})});
      if(reduce){const now=performance.now();els.forEach(c=>draw(c,now))}
      else if(!rafL&&els.length)rafL=requestAnimationFrame(frame);
    },
    stir(card,e){
      if(!gl||reduce)return;
      const c=card.querySelector("canvas.lq"),s=c&&st.get(c);if(!s)return;
      const r=card.getBoundingClientRect(),x=(e.clientX-r.left)/r.width,y=1-(e.clientY-r.top)/r.height,now=performance.now();
      let vx=0,vy=0;
      if(s.last&&now-s.last.t<150){vx=x-s.last.x;vy=y-s.last.y;const m=Math.hypot(vx,vy);if(m<.008)return;if(m>.15){vx*=.15/m;vy*=.15/m}}
      s.last={x,y,t:now};s.pts.push({x,y,vx,vy});if(s.pts.length>N)s.pts.shift();
    }
  };
})();

/* ---------- doodles: hand-drawn outline shapes on the yellow cards ---------- */
let doodleN=0;
function seeded(str){let a=2166136261;for(const ch of str)a=Math.imul(a^ch.charCodeAt(0),16777619);return()=>{a=(a+0x6D2B79F5)|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function curve(p,closed){const n=p.length,f=v=>v.toFixed(1),P=i=>closed?p[(i+n)%n]:p[Math.max(0,Math.min(n-1,i))];let d=`M${f(p[0][0])},${f(p[0][1])}`;
  for(let i=0;i<(closed?n:n-1);i++){const p0=P(i-1),p1=P(i),p2=P(i+1),p3=P(i+2);d+=`C${f(p1[0]+(p2[0]-p0[0])/6)},${f(p1[1]+(p2[1]-p0[1])/6)} ${f(p2[0]-(p3[0]-p1[0])/6)},${f(p2[1]-(p3[1]-p1[1])/6)} ${f(p2[0])},${f(p2[1])}`}
  return closed?d+"Z":d}
function doodleSVG(seed){
  // Topographic fill: contour lines of a smooth, large-scale noise field (marching squares), chained into paths so they can draw in.
  const r=seeded(seed),W=228,H=150,C=5,gx=Math.ceil(W/C)+1,gy=Math.ceil(H/C)+1;
  const G=10,lat=[];for(let i=0;i<(G+1)*(G+1);i++)lat.push(r());
  const sm=t=>t*t*(3-2*t),L=(x,y)=>lat[(y%(G+1))*(G+1)+(x%(G+1))];
  const vn=(x,y)=>{const xi=Math.floor(x),yi=Math.floor(y),xf=sm(x-xi),yf=sm(y-yi);return (L(xi,yi)*(1-xf)+L(xi+1,yi)*xf)*(1-yf)+(L(xi,yi+1)*(1-xf)+L(xi+1,yi+1)*xf)*yf};
  const ox=r()*3,oy=r()*3,field=[];
  for(let y=0;y<gy;y++)for(let x=0;x<gx;x++){const u=x*C/W*3.1+ox,v=y*C/H*2.1+oy;field.push(vn(u,v)*.78+vn(u*2.1+3,v*2.1+3)*.22)}
  const F=(x,y)=>field[y*gx+x],paths=[];
  const levels=[.26,.33,.4,.47,.54,.61,.68,.75];
  levels.forEach((lv,li)=>{
    const segs=[];
    const ip=(x1,y1,v1,x2,y2,v2)=>{const t=(lv-v1)/(v2-v1);return [(x1+(x2-x1)*t)*C,(y1+(y2-y1)*t)*C]};
    for(let y=0;y<gy-1;y++)for(let x=0;x<gx-1;x++){
      const a=F(x,y),b=F(x+1,y),c=F(x+1,y+1),d=F(x,y+1);
      const k=(a>lv?8:0)|(b>lv?4:0)|(c>lv?2:0)|(d>lv?1:0);if(k===0||k===15)continue;
      const T=ip(x,y,a,x+1,y,b),R=ip(x+1,y,b,x+1,y+1,c),B=ip(x,y+1,d,x+1,y+1,c),Lf=ip(x,y,a,x,y+1,d);
      const m={1:[[Lf,B]],2:[[B,R]],3:[[Lf,R]],4:[[T,R]],5:[[Lf,T],[B,R]],6:[[T,B]],7:[[Lf,T]],8:[[Lf,T]],9:[[T,B]],10:[[T,R],[Lf,B]],11:[[T,R]],12:[[Lf,R]],13:[[B,R]],14:[[Lf,B]]}[k];
      m.forEach(sg=>segs.push(sg));
    }
    const key=p=>p[0].toFixed(2)+","+p[1].toFixed(2),ends=new Map(),used=new Array(segs.length).fill(false);
    segs.forEach((sg,i)=>sg.forEach(p=>{const k=key(p);(ends.get(k)||ends.set(k,[]).get(k)).push(i)}));
    for(let i=0;i<segs.length;i++){
      if(used[i])continue;used[i]=true;const chain=[segs[i][0],segs[i][1]];
      for(const dir of [1,0]){
        let cur=dir?chain[chain.length-1]:chain[0];
        for(;;){const nx=(ends.get(key(cur))||[]).find(j=>!used[j]);if(nx===undefined)break;used[nx]=true;const sg=segs[nx],nextP=key(sg[0])===key(cur)?sg[1]:sg[0];if(dir)chain.push(nextP);else chain.unshift(nextP);cur=nextP}
      }
      if(chain.length<4)continue;
      const closed=key(chain[0])===key(chain[chain.length-1]);
      const pts=closed?chain.slice(0,-1):chain;
      paths.push({d:curve(pts,closed),dl:li*.09+r()*.15});
    }
  });
  return `<svg class="doodle" viewBox="0 0 228 150" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${paths.map(q=>`<path pathLength="1" d="${q.d}" style="--d:${q.dl.toFixed(2)}s"/>`).join("")}</svg>`;
}
function playDoodle(card){const svg=card.querySelector("svg.doodle");if(!svg||reduce)return;svg.classList.remove("play");void svg.getBoundingClientRect();svg.classList.add("play")}
let doodleIO=null;
function watchDoodles(root){
  doodleIO?.disconnect();if(!root||reduce||!("IntersectionObserver" in window))return;
  doodleIO=new IntersectionObserver(es=>{for(const e of es){if(e.isIntersecting)playDoodle(e.target);else e.target.querySelector("svg.doodle")?.classList.remove("play")}},{threshold:.35});
  root.querySelectorAll(".t-metric.volt").forEach(el=>doodleIO.observe(el));
}

/* ---------- wind: the cursor blows pill piles around, then they spring back ---------- */
const Wind=(()=>{
  const st=new WeakMap(),act=new Set(),R=170;let rafW=null,last=null;
  const state=el=>{let s=st.get(el);if(!s){s={x:0,y:0,r:0,vx:0,vy:0,vr:0,base:parseFloat(el.style.getPropertyValue("--r"))||0};st.set(el,s)}return s};
  function step(){
    rafW=null;
    for(const el of act){
      const s=st.get(el);
      if(!el.isConnected){act.delete(el);continue}
      s.vx=(s.vx-s.x*.045)*.9;s.vy=(s.vy-s.y*.045)*.9;s.vr=(s.vr-s.r*.04)*.9;
      s.x=Math.max(-110,Math.min(110,s.x+s.vx));s.y=Math.max(-110,Math.min(110,s.y+s.vy));s.r=Math.max(-40,Math.min(40,s.r+s.vr));
      if(Math.abs(s.x)+Math.abs(s.y)+Math.abs(s.r)<.15&&Math.abs(s.vx)+Math.abs(s.vy)+Math.abs(s.vr)<.15){s.x=s.y=s.r=s.vx=s.vy=s.vr=0;el.style.transform="";act.delete(el);continue}
      el.style.transform=`translate(${s.x.toFixed(1)}px,${s.y.toFixed(1)}px) rotate(${(s.base+s.r).toFixed(2)}deg)`;
    }
    if(act.size)rafW=requestAnimationFrame(step);
  }
  return {blow(e){
    if(reduce)return;
    const now=performance.now();let mx=0,my=0;
    if(last&&now-last.t<120){mx=e.clientX-last.x;my=e.clientY-last.y}
    last={x:e.clientX,y:e.clientY,t:now};
    const sp=Math.min(60,Math.hypot(mx,my));if(sp<.5)return;
    for(const pile of document.querySelectorAll(".pile")){
      const pr=pile.getBoundingClientRect();
      if(e.clientX<pr.left-R||e.clientX>pr.right+R||e.clientY<pr.top-R||e.clientY>pr.bottom+R)continue;
      for(const el of pile.querySelectorAll(".bpill")){
        const b=el.getBoundingClientRect(),dx=b.left+b.width/2-e.clientX,dy=b.top+b.height/2-e.clientY,d=Math.hypot(dx,dy)||1;
        if(d>R)continue;
        const f=(1-d/R)**2,s=state(el),push=sp*.13;
        s.vx+=(dx/d*push+mx*.17)*f;s.vy+=(dy/d*push+my*.17)*f;s.vr+=(mx*.05-my*.02*Math.sign(dx))*f*1.4;
        act.add(el);
      }
    }
    if(act.size&&!rafW)rafW=requestAnimationFrame(step);
  }};
})();

/* ---------- infinite canvas ---------- */
const field=$("#field");
let nodes=[],W=0,H=0,ox=0,oy=0,vx=0,vy=0,raf=null,drag=null,moved=false,idle=!reduce;
const COLW=228,CELLH=228,SHORTH=150,GAP=40,PITCH=COLW+GAP,PY=CELLH+GAP;
// Pinch-to-zoom on touch devices (phones, iPads). Mouse-only desktops stay at 1x.
const ZOOM_ON=navigator.maxTouchPoints>0||matchMedia("(any-pointer:coarse)").matches,ZMIN=ZOOM_ON?.5:1,ZMAX=ZOOM_ON?1.5:1;
let zoom=1,pinch=null,VW=0,VH=0;const touches=new Map();
let GH=PY*2;
let lastOx=0,lastOy=0,blurOn=false,bx0=0,by0=0;
const mbG=document.getElementById("mblurG");

function pillDefs(){
  const set=new Set();
  items.forEach(d=>{set.add("role:"+d.aiRole);set.add("form:"+d.form);set.add("digital:"+d.digital);(d.flags||[]).forEach(f=>set.add("flag:"+f))});
  set.add("verified:1");
  return [...set].filter(k=>!k.endsWith(":undefined")&&!k.endsWith(":"));
}
function pillLabel(k){const [t,v]=k.split(/:(.+)/);return t==="role"?roleName(v):t==="verified"?"Verified profit":v}
function matchPill(k,d){const [t,v]=k.split(/:(.+)/);
  if(t==="role")return d.aiRole===v; if(t==="form")return d.form===v; if(t==="digital")return d.digital===v; if(t==="flag")return (d.flags||[]).includes(v);
  if(t==="verified")return profitState(d)==="verified"; return false}

function tileHTML(kind,d){
  const c=ROLE_C[d.aiRole]||"var(--none)";
  if(kind==="name") return `<button class="tile t-name" data-id="${esc(d.id)}"><div><div class="nm">${esc(d.name)}</div><div class="cls" style="margin-top:10px">${esc(d.form)}<br>${esc(d.digital)}</div></div><div class="foot"><span class="dotrole" style="--c:${c}">${esc(roleName(d.aiRole))}</span><div class="sg" style="text-align:right">${d.included?`<small>Signal</small>${d.signal}`:`<small>Status</small><span style="font-size:20px;color:var(--flag)">Watchlist</span>`}</div></div></button>`;
  if(kind==="icon") return `<button class="tile-ico" data-id="${esc(d.id)}" aria-label="${esc(d.name)}" style="--c:${c}">${icoHTML(d,"ico ico-xl")}<span class="cap">${esc(d.name)}</span></button>`;
  if(kind==="metric"){const e=(d.evidence||[])[0]||{};const lq=d.aiRole&&d.aiRole!=="None"&&Liquid.ok;return `<button class="tile t-metric${lq?" liquid":" volt"}" data-id="${esc(d.id)}">${lq?'<canvas class="lq" aria-hidden="true"></canvas>':doodleSVG(d.id+":"+(doodleN++))}<div class="lbl">${esc(d.name)} · ${esc(e.metric||"Headline metric")}${e.period?", "+esc(e.period):""}</div><div class="val${String(e.value||"").length>9?" long":""}">${esc(e.value||"No figure yet")}</div><div class="src"><span>${e.selfReported&&/^(Company-reported|Founder post)$/.test(e.tier||"")?"":esc(({"Company financial statements":"Company financials","Regulatory/acquirer filing":"Acquirer filing"})[e.tier]||e.tier||"")}</span>${e.selfReported?'<span class="self">Self-reported</span>':""}</div></button>`}
  return `<button class="tile t-score" data-id="${esc(d.id)}"><div class="who">${esc(d.name)}</div><div><div class="k">Trust in the numbers</div><span class="pips">${[1,2,3,4,5].map(i=>`<i class="${i<=d.confidence?"on":""}"></i>`).join("")}</span></div><div><div class="k">Strength ${d.strength}/25</div><div class="bar"><span style="width:${d.strength/25*100}%"></span></div></div></button>`;
}

function groupDefs(){
  const defs=pillDefs(),G=[["role","AI role"],["form","Product form"],["digital","Digital intensity"],["flag","Watch-outs"],["verified","Proof"]];
  return G.map(([t,l])=>({label:l,keys:defs.filter(k=>k.split(":")[0]===t)})).filter(g=>g.keys.length);
}
function pileDefs(){const g=groupDefs(),proof=g.find(x=>x.label==="Proof"),out=g.filter(x=>x!==proof);if(proof){const w=out.find(x=>x.label==="Watch-outs");if(w){w.label="Proof and watch-outs";w.keys=[...proof.keys,...w.keys]}else out.push(proof)}return out}
const TILT=[-6,4,-3,7,-8,3,6,-4,2,-7,5,-2];
const PILLC=["cobalt","lime","chalk","peri","lime","cobalt","peri","chalk"];
function pileHTML(g,n=0){return `<div class="pile" role="group" aria-label="${esc(g.label)}"><div class="gp">${g.keys.map((k,i)=>`<button class="bpill c-${PILLC[(i+n*3)%PILLC.length]}" data-pill="${esc(k)}" aria-pressed="${!!(highlight&&highlight.pill===k)}" style="--r:${TILT[(i+n)%TILT.length]}deg">${esc(pillLabel(k))}</button>`).join("")}</div></div>`}
function groupHTML(g,cls=""){return `<div class="tile t-group ${cls}"><div class="gt">${esc(g.label)}</div><div class="gp">${g.keys.map(k=>`<button class="pill" data-pill="${esc(k)}" aria-pressed="${!!(highlight&&highlight.pill===k)}">${esc(pillLabel(k))}</button>`).join("")}</div></div>`}
const BRAND_TILE=`<div class="tile-ico tile-brand" aria-hidden="true"><img src="/app-icon-glass.png" alt="" draggable="false" loading="lazy"></div>`;
// Hover (or tap) on the brand tile: the icon bursts into particles and reassembles, signalling it is decorative.
function dissolve(tile,e){
  if(reduce||tile._busy)return;const img=tile.querySelector("img");if(!img||!img.complete||!img.naturalWidth)return;
  tile._busy=true;
  const S=img.offsetWidth||156,PAD=90,dpr=Math.min(2,devicePixelRatio||1),CW=S+PAD*2;
  const src=document.createElement("canvas");src.width=S;src.height=S;const sx=src.getContext("2d");
  let data;try{sx.drawImage(img,0,0,S,S);data=sx.getImageData(0,0,S,S).data}catch{tile._busy=false;return}
  const cv=document.createElement("canvas");cv.className="brand-fx";cv.width=CW*dpr;cv.height=CW*dpr;cv.style.width=cv.style.height=CW+"px";
  const ctx=cv.getContext("2d");ctx.scale(dpr,dpr);
  const r=img.getBoundingClientRect(),hx=e?((e.clientX-r.left)/r.width)*S:S/2,hy=e?((e.clientY-r.top)/r.height)*S:S/2;
  const P=[],STEP=3;
  for(let y=0;y<S;y+=STEP)for(let x=0;x<S;x+=STEP){const i=(y*S+x)*4,a=data[i+3];if(a<40)continue;
    const dx=x-hx,dy=y-hy,d=Math.hypot(dx,dy)||1,ang=Math.atan2(dy,dx)+(Math.random()-.5)*1.1,dist=30+Math.random()*70+(1-Math.min(1,d/S))*30;
    P.push({x,y,tx:Math.cos(ang)*dist,ty:Math.sin(ang)*dist-Math.random()*20,c:`rgba(${data[i]},${data[i+1]},${data[i+2]},${(a/255).toFixed(2)})`,dl:Math.random()*.12})}
  tile.appendChild(cv);img.style.transition="none";
  // Crossfade at both ends: image fades out as particles appear, and fades back in while they settle, so there is no swap.
  const T=1700,IN=.1,OUT=.7,t0=performance.now(),eo=t=>1-Math.pow(1-t,3),eio=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2,ss=t=>t*t*(3-2*t);
  (function frame(now){
    const t=Math.min(1,(now-t0)/T);ctx.clearRect(0,0,CW,CW);
    const imgA=t<IN?1-ss(t/IN):t>OUT?ss((t-OUT)/(1-OUT)):0,partA=t<IN?ss(t/IN):t>OUT?1-ss((t-OUT)/(1-OUT)):1;
    img.style.opacity=imgA.toFixed(3);
    for(const p of P){const u=Math.max(0,Math.min(1,(t-p.dl)/(1-p.dl)));const f=u<.4?eo(u/.4):1-eio((u-.4)/.6);
      ctx.globalAlpha=partA*(1-f*.5);ctx.fillStyle=p.c;ctx.fillRect(PAD+p.x+p.tx*f,PAD+p.y+p.ty*f,STEP+.5,STEP+.5)}
    if(t<1)requestAnimationFrame(frame);else{img.style.opacity="";img.style.transition="";cv.remove();setTimeout(()=>{tile._busy=false},300)}
  })(t0);
}
function buildField(){
  if($("#explore").hidden)return;
  const vw=field.clientWidth||innerWidth, vh=field.clientHeight||innerHeight;
  const sorted=[...items].sort((a,b)=>b.signal-a.signal),N=sorted.length;
  if(!N){field.innerHTML="";nodes=[];return}
  const groups=groupDefs();
  // One company = a block of two rows: a tall row (icon + name card) over a short row (green metric + score).
  // Even block rows: [icon][name] / [metric][score]. Odd block rows: [name][icon] / [score][metric].
  // Tall rows and short rows alternate, so two icons never touch.
  const BH=CELLH+SHORTH+GAP*2,piles=pileDefs();
  VW=vw;VH=vh;
  // Build enough tiles to fill the screen at the most zoomed-out level.
  const bc=Math.max(2,Math.ceil((vw/ZMIN+PITCH*3)/(2*PITCH))), br=Math.max(2,Math.ceil((vh/ZMIN+BH*2)/BH));
  W=bc*2*PITCH; GH=br*BH;
  const html=[];nodes=[];let gi=0;
  const put=(col,y,inner,ids,pills,wide,h)=>{nodes.push({bx:col*PITCH,by:y,ids,pills,mx:wide?PITCH*2:PITCH,my:(h||CELLH)+GAP});html.push(`<div class="item${wide?" wide":""}">${inner}</div>`)};
  for(let r=0;r<br;r++)for(let c=0;c<bc;c++){
    const x0=c*2,yT=r*BH,yS=yT+CELLH+GAP;
    if(piles.length&&(c+r*2)%5===3){
      // A browse block: one pile of standalone pills filling the same footprint as a company block.
      const g=piles[gi%piles.length];put(x0,yT,pileHTML(g,gi++),null,g.keys,true,CELLH+GAP+SHORTH);
      continue;
    }
    const d=sorted[(r*3+c)%N],ev=r%2===0;
    // Now and then the icon slot shows our own glass app icon instead (decorative, not clickable).
    const brand=(c*7+r*13)%11===5;
    put(ev?x0:x0+1,yT,brand?BRAND_TILE:tileHTML("icon",d),brand?null:d.id);
    put(ev?x0+1:x0,yT,tileHTML("name",d),d.id);
    put(ev?x0:x0+1,yS,tileHTML("metric",d),d.id);
    put(ev?x0+1:x0,yS,tileHTML("score",d),d.id);
  }
  field.innerHTML=`<div class="layer" id="layer">${html.join("")}</div>`;
  [...$("#layer").children].forEach((el,i)=>nodes[i].el=el);
  if(!window._placed&&nodes.length){window._placed=1;ox=48;oy=96;lastOx=ox;lastOy=oy}
  applyHighlight(); paint(); Liquid.attach($("#layer")); watchDoodles($("#layer"));
  if(!raf) raf=requestAnimationFrame(loop);
}
const mod=(n,m)=>((n%m)+m)%m;
// The layer scales around the screen centre, so shift the wrap window to cover the wider visible area when zoomed out.
// lensK > 0 during the intro: a fisheye that pushes tiles out from the screen centre and enlarges the ones near it.
let lensK=0;
function paint(){const X=ox+aim.ax,Y=oy+aim.ay,px=VW/2*(1/zoom-1),py=VH/2*(1/zoom-1);
  const cx=VW/2,cy=VH/2,R2=(VW*VW+VH*VH)/4||1,lens=Math.abs(lensK)>.001;
  for(const n of nodes){let x=mod(n.bx+X+n.mx+px,W)-n.mx-px,y=mod(n.by+Y+n.my+py,GH)-n.my-py;
    if(!lens){n.el.style.transform=`translate3d(${Math.round(x)}px,${Math.round(y)}px,0)`;continue}
    // Bulge: displacement and size fall off with distance from the centre (gaussian), so the middle swells most.
    const w=n.mx-GAP,h=n.my-GAP,dx=x+w/2-cx,dy=y+h/2-cy,s=1+lensK*1.1*Math.exp(-(dx*dx+dy*dy)/R2*2.2);
    x=cx+dx*s-w/2;y=cy+dy*s-h/2;
    n.el.style.transform=`translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) scale(${s.toFixed(3)})`}}
function motionBlur(){
  // Skipped on touch devices: iOS renders SVG filters in software, and toggling one over live canvases makes their text flash.
  if(reduce||ZOOM_ON)return;
  const dx=ox-lastOx,dy=oy-lastOy;lastOx=ox;lastOy=oy;
  const bxv=Math.min(10,Math.max(0,Math.abs(dx)-4)*.26),byv=Math.min(10,Math.max(0,Math.abs(dy)-4)*.26);
  bx0+=(bxv-bx0)*.45;by0+=(byv-by0)*.45;
  const layer=$("#layer");if(!layer)return;
  if(bx0<.35&&by0<.35){if(blurOn){layer.style.filter="";blurOn=false}return}
  mbG.setAttribute("stdDeviation",bx0.toFixed(2)+" "+by0.toFixed(2));
  if(!blurOn){layer.style.filter="url(#mblur)";blurOn=true}
}
const aim={on:false,x:0,y:0,overTarget:false,tx:0,ty:0,ax:0,ay:0};
function loop(){
  raf=null;
  const sheetOn=$("#sheet").classList.contains("on");
  if(!drag){
    if(aim.on&&!sheetOn&&$("#askPanel").hidden){
      // Cursor-lean camera: the view leans a bounded distance toward where the cursor points, then rests.
      const w=field.clientWidth||innerWidth,h=field.clientHeight||innerHeight,nx=(aim.x/w)*2-1,ny=(aim.y/h)*2-1,dz=.08;
      const ex=Math.sign(nx)*Math.max(0,Math.abs(nx)-dz)/(1-dz),ey=Math.sign(ny)*Math.max(0,Math.abs(ny)-dz)/(1-dz);
      aim.tx=-ex*w*.11;aim.ty=-ey*h*.11;
      vx*=.92;vy*=.92;
    }
    else if(idle&&!sheetOn){vx+=(-.35-vx)*.05;vy+=(-.18-vy)*.05}
    else if(idle){vx=vy=0}
    else {vx*=.94;vy*=.94}
  }
  if(!(aim.on&&!sheetOn&&$("#askPanel").hidden)){aim.tx=0;aim.ty=0}
  const dax=(aim.tx-aim.ax)*.045,day=(aim.ty-aim.ay)*.045,leaning=Math.abs(dax)>.02||Math.abs(day)>.02;
  if(leaning){aim.ax+=dax;aim.ay+=day}
  if(Math.abs(vx)>.01||Math.abs(vy)>.01||drag||leaning){ if(!drag){ox+=vx;oy+=vy} paint() }
  motionBlur();
  if(!$("#explore").hidden) raf=requestAnimationFrame(loop);
}
const setZoom=z=>{zoom=Math.min(ZMAX,Math.max(ZMIN,z));field.style.setProperty("--z",zoom)};
// Midpoint in canvas coordinates (on phones the canvas starts above the screen top, under the status bar).
const pinchState=()=>{const [a,b]=[...touches.values()],r=field.getBoundingClientRect();return {d:Math.hypot(b.x-a.x,b.y-a.y)||1,mx:(a.x+b.x)/2-r.left,my:(a.y+b.y)/2-r.top}};
if(ZOOM_ON){
  // Safari fallback: iOS reports pinches as gesture events with a scale. Used whenever the pointer-event pinch is not active.
  let gz=null;
  const gxy=e=>{const r=field.getBoundingClientRect();return {x:Number.isFinite(e.clientX)?e.clientX-r.left:VW/2,y:Number.isFinite(e.clientY)?e.clientY-r.top:VH/2}};
  field.addEventListener("gesturestart",e=>{e.preventDefault();const p=gxy(e);gz={base:zoom,x:p.x,y:p.y};idle=false;vx=vy=0});
  field.addEventListener("gesturechange",e=>{e.preventDefault();if(!gz)return;const p=gxy(e);
    if(pinch){gz.base=zoom/(e.scale||1);gz.x=p.x;gz.y=p.y;return}
    const z0=zoom,cx=VW/2,cy=VH/2;setZoom(gz.base*(e.scale||1));field.classList.add("pinching");
    ox+=(p.x-cx)/zoom-(gz.x-cx)/z0;oy+=(p.y-cy)/zoom-(gz.y-cy)/z0;gz.x=p.x;gz.y=p.y;drag=null;moved=true;paint()});
  field.addEventListener("gestureend",e=>{e.preventDefault();gz=null;if(!pinch)field.classList.remove("pinching")});
  // Stop the browser from treating a two-finger move as page zoom or scroll.
  field.addEventListener("touchmove",e=>{if(e.touches.length>1)e.preventDefault()},{passive:false});
}
field.addEventListener("pointerdown",e=>{
  if(ZOOM_ON&&e.pointerType==="touch"){
    touches.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(touches.size===2){const s=pinchState();pinch={d:s.d,z:zoom,mx:s.mx,my:s.my};drag=null;moved=true;idle=false;vx=vy=0;field.classList.remove("dragging");field.classList.add("pinching");return}
    if(touches.size>2)return;
  }
  if(e.button!==0)return;drag={x:e.clientX,y:e.clientY,id:e.pointerId};moved=false;idle=false;vx=vy=0});
field.addEventListener("pointermove",e=>{
  if(touches.has(e.pointerId))touches.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pinch){
    if(touches.size<2)return;
    // Zoom by finger spread, keeping the content under the fingers' midpoint pinned (and panning with it).
    const s=pinchState(),z0=zoom,cx=VW/2,cy=VH/2;setZoom(pinch.z*s.d/pinch.d);
    ox+=(s.mx-cx)/zoom-(pinch.mx-cx)/z0;oy+=(s.my-cy)/zoom-(pinch.my-cy)/z0;pinch.mx=s.mx;pinch.my=s.my;paint();return;
  }
  if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(!moved&&Math.abs(dx)+Math.abs(dy)>5){moved=true;field.classList.add("dragging");try{field.setPointerCapture(drag.id)}catch{}}if(moved){ox+=dx/zoom;oy+=dy/zoom;vx=dx/zoom;vy=dy/zoom;drag.x=e.clientX;drag.y=e.clientY;paint()}});
field.addEventListener("pointermove",e=>{if(e.pointerType==="mouse"&&!reduce){const r=field.getBoundingClientRect();aim.on=true;aim.x=e.clientX-r.left;aim.y=e.clientY-r.top;aim.overTarget=!!e.target.closest("[data-id],[data-pill]");if(!raf)raf=requestAnimationFrame(loop)}if(pinch||(drag&&moved))return;Wind.blow(e);const c=e.target.closest(".liquid");if(c)Liquid.stir(c,e)});
field.addEventListener("pointerleave",()=>{aim.on=false});
field.addEventListener("pointerover",e=>{if(e.pointerType!=="mouse"||drag&&moved)return;const b=e.target.closest(".tile-brand");if(b&&!b.contains(e.relatedTarget))dissolve(b,e)});
field.addEventListener("pointerover",e=>{const c=e.target.closest(".t-metric.volt");if(c&&!c.contains(e.relatedTarget))playDoodle(c)});addEventListener("blur",()=>{aim.on=false});
const endDrag=e=>{
  touches.delete(e.pointerId);
  if(pinch){
    if(touches.size<2){pinch=null;field.classList.remove("pinching");drag=null;
      // One finger still down: carry on panning with it.
      if(touches.size===1){const [[id,p]]=[...touches];drag={x:p.x,y:p.y,id}}
      if(!raf)raf=requestAnimationFrame(loop)}
    return;
  }
  if(!drag)return;drag=null;field.classList.remove("dragging");if(!raf)raf=requestAnimationFrame(loop)};
field.addEventListener("pointerup",endDrag);field.addEventListener("pointercancel",endDrag);
field.addEventListener("wheel",e=>{e.preventDefault();idle=false;ox-=e.deltaX/zoom;oy-=e.deltaY/zoom;vx=-e.deltaX*.2/zoom;vy=-e.deltaY*.2/zoom;paint();if(!raf)raf=requestAnimationFrame(loop)},{passive:false});
field.addEventListener("keydown",e=>{const m={ArrowLeft:[80,0],ArrowRight:[-80,0],ArrowUp:[0,80],ArrowDown:[0,-80]}[e.key];if(m&&e.target===field){e.preventDefault();idle=false;ox+=m[0];oy+=m[1];paint()}});
field.addEventListener("click",e=>{
  if(moved){e.preventDefault();e.stopPropagation();moved=false;return}
  const bt=e.target.closest(".tile-brand"); if(bt){dissolve(bt,e);return}
  const t=e.target.closest("[data-id]"); if(t){openDetail(t.dataset.id);return}
  const p=e.target.closest("[data-pill]"); if(p)applyPill(p.dataset.pill);
},true);
addEventListener("resize",()=>{clearTimeout(window._rz);window._rz=setTimeout(buildField,150)});

function applyPill(k){if(highlight&&highlight.pill===k){clearHighlight();return}const ids=items.filter(d=>matchPill(k,d)).map(d=>d.id);setHighlight(ids,k);showAnswer(`${pillLabel(k)}: ${ids.length} ${ids.length===1?"company":"companies"}.`,ids,"Filter")}
function setHighlight(ids,pill){highlight={ids:new Set(ids),pill:pill||null};applyHighlight()}
function clearHighlight(){highlight=null;applyHighlight();$("#answer").innerHTML=""}
function applyHighlight(){
  for(const n of nodes){
    let dim=false;
    if(highlight){dim=n.pills?!(highlight.pill&&n.pills.includes(highlight.pill)):!highlight.ids.has(n.ids)}
    n.el.classList.toggle("dim",dim);
    n.el.querySelectorAll("[data-pill]").forEach(pb=>pb.setAttribute("aria-pressed",!!(highlight&&highlight.pill===pb.dataset.pill)));
  }
}

/* ---------- ask / search ---------- */
function showAnswer(text,ids,source,sources){
  const hits=ids.map(id=>items.find(d=>d.id===id)).filter(Boolean);
  // Web sources from a market-guidance answer: shown separately so they are never mistaken for dataset evidence.
  const web=(sources||[]).filter(s=>safeUrl(s.url));
  $("#answer").innerHTML=`<div class="answer" role="status"><p>${esc(text)}</p>${hits.length?`<div class="hits">${hits.map(d=>`<button data-open="${esc(d.id)}">${esc(d.name)}</button>`).join("")}</div>`:""}${web.length?`<div class="web"><span>Web check (unverified):</span>${web.map(s=>`<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)} ↗</a>`).join("")}</div>`:""}<div class="meta"><span>${esc(source)}</span><button data-clear>Clear</button></div></div>`;
}
$("#answer").addEventListener("click",e=>{const o=e.target.closest("[data-open]");if(o)openDetail(o.dataset.open);if(e.target.closest("[data-clear]")){clearHighlight();$("#askInput").value=""}});
$("#sugs").addEventListener("click",e=>{const b=e.target.closest("button");if(b){$("#askInput").value=b.textContent;closePanel();ask(b.textContent)}});
$("#browse").addEventListener("click",e=>{const b=e.target.closest("[data-pill]");if(b){closePanel();applyPill(b.dataset.pill)}});
function openPanel(){const pnl=$("#askPanel");if(!pnl.hidden)return;
  const defs=pillDefs(),groups=[["verified","Proof"],["role","AI role"],["form","Product form"],["digital","Digital intensity"],["flag","Watch-outs"]];
  const btn=k=>`<button type="button" data-pill="${esc(k)}" aria-pressed="${!!(highlight&&highlight.pill===k)}">${esc(pillLabel(k))}</button>`;
  $("#browse").innerHTML=defs.length?groups.map(([t,l])=>{const ks=defs.filter(k=>k.split(":")[0]===t).sort((a,b)=>pillLabel(a).localeCompare(pillLabel(b)));return ks.length?`<div class="grp"><h5>${l}</h5><div class="opts">${ks.map(btn).join("")}</div></div>`:""}).join(""):'<p class="status">Categories appear once companies load.</p>';
  pnl.hidden=false;$("#answer").hidden=true;$("#askInput").setAttribute("aria-expanded","true")}
function closePanel(){$("#askPanel").hidden=true;$("#answer").hidden=false;$("#askInput").setAttribute("aria-expanded","false")}
$("#askInput").addEventListener("focus",openPanel);
// iOS keyboard: the layout viewport keeps its full height while the visible area shrinks. Track the visible area so the
// search bar sits just above the keyboard and the panel is capped to the space actually on screen (it scrolls inside).
const vv=window.visualViewport;
function fitAsk(){
  if(!vv)return;
  const lh=document.documentElement.clientHeight,kb=Math.max(0,Math.round(lh-vv.height-vv.offsetTop)),r=document.documentElement.style;
  r.setProperty("--vvh",Math.round(vv.height)+"px");r.setProperty("--kb",kb+"px");
  document.body.classList.toggle("kb-open",kb>80);
}
if(vv){vv.addEventListener("resize",fitAsk);vv.addEventListener("scroll",fitAsk);fitAsk()}
$("#askInput").addEventListener("keydown",e=>{if(e.key==="Escape"){closePanel();e.target.blur()}});
document.addEventListener("pointerdown",e=>{if(!$("#askPanel").hidden&&!e.target.closest(".ask"))closePanel()});
$("#askForm").addEventListener("submit",e=>{e.preventDefault();const q=$("#askInput").value.trim();if(q){closePanel();ask(q)}});

function localMatch(q){
  const s=q.toLowerCase();
  let ids=items.filter(d=>[d.name,d.form,d.digital,d.aiRole,roleName(d.aiRole),d.customer,d.model,d.industry,d.ecosystemRole,d.parentCompany,...(d.tags||[]),...(d.flags||[]),d.summary].join(" ").toLowerCase().includes(s)).map(d=>d.id);
  if(!ids.length){
    // "non-AI" must not also trigger the AI rule: the hyphen is a word boundary, so \bai\b matches inside "non-ai".
    const NON_AI=/\bnon[- ]?ai\b|\bno ai\b|\bwithout ai\b|\btraditional\b/;
    const rules=[
      [q=>/\bprofit/.test(q),d=>profitState(d)==="verified"],
      [q=>NON_AI.test(q),d=>d.aiRole==="None"],
      [q=>/\bai\b/.test(q)&&!NON_AI.test(q),d=>d.aiRole!=="None"],
      [q=>/\bphysical\b|\bhardware\b|\bconsumer goods\b/.test(q),d=>/Physical|Hardware/.test(d.form)],
      [q=>/\bgames?\b|\bgaming\b/.test(q),d=>d.form==="Game"],
      [q=>/\bhype\b|\bthin\b|\bclaims?\b/.test(q),d=>d.strength>=12&&d.confidence<=2],
      [q=>/\bapps?\b|\bsoftware\b|\bsaas\b/.test(q),d=>/app|software/i.test(d.form)],
      [q=>/\bacquir/.test(q),d=>(d.evidence||[]).some(e=>e.type==="Acquisition price")],
    ];
    // Any industry or tag named in the query also narrows the result ("creator tools subscription").
    // Words a built-in rule already handled are removed first, so "physical products" is not also read as the tag
    // "Physical product" (two different filters on the same words left nothing).
    const HANDLED=/\bprofit\w*|\bnon[- ]?ai\b|\bno ai\b|\bwithout ai\b|\btraditional\b|\bai\b|\bphysical\b|\bhardware\b|\bconsumer goods\b|\bgames?\b|\bgaming\b|\bhype\b|\bthin\b|\bclaims?\b|\bapps?\b|\bsoftware\b|\bsaas\b|\bacquir\w*/g;
    const rest=s.replace(HANDLED," ");
    const labels=[...new Set(items.flatMap(d=>[d.industry,...(d.tags||[])]).filter(Boolean))];
    for(const lb of labels){const l=lb.toLowerCase().replace(/s$/,"");if(l.length>2&&new RegExp(`\\b${l.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}`).test(rest))rules.push([()=>true,d=>d.industry===lb||(d.tags||[]).includes(lb)])}
    // Every matched term must hold ("profitable games" = profitable AND games). No fallback to "either":
    // showing companies that match only part of the query misrepresents what was asked.
    const sets=rules.filter(([test])=>test(s)).map(([,fn])=>new Set(items.filter(fn).map(d=>d.id)));
    ids=sets.length?[...sets[0]].filter(id=>sets.every(x=>x.has(id))):[];
  }
  return ids;
}
let askCtl=null;
const ASK_MAX=280;
// Questions that need synthesis go to AI. Plain filters ("profitable games") are answered from the data for free.
const SYNTH=/\b(why|how|pattern|common|compare|comparison|versus|vs|better|best|worse|outperform|worth|should|build|opportunit|trend|explain|insight|difference|similar|what makes|what do|what are .* doing)\b/i;
const untilWord=iso=>{const ms=Date.parse(iso)-Date.now();if(!(ms>0))return "";const h=Math.floor(ms/36e5),m=Math.ceil((ms%36e5)/6e4);return h?`${h}h ${m}m`:`${m}m`};
function searchResult(q,local,note){
  setHighlight(local);
  const found=local.length?`Found ${local.length} matching ${local.length===1?"company":"companies"}.`:"Nothing in the dataset matches that yet. Try a company name, a category like games or physical products, or open the board.";
  showAnswer(note?`${note} ${found}`:found,local,"Search");
}
/* ---------- thinking animation (answer panel only) ----------
   A short strip of green dots with a soft wave rippling out from the centre, plus honest status lines. No percentage:
   real progress is unknown. Build/opportunity questions also do a web check on the server, so they get one more
   step. This pattern mirrors lib/ask.ts GUIDANCE only to choose the lines; the server still decides the mode.
   The answer replaces it in place (showAnswer rewrites the panel), which also stops the loop. */
const GUIDE_Q=/\b(should|could|can|would)\b.*\b(build|make|launch|start|create|sell)\b|\b(worth|realistic(ally)?)\b.*\b(build|make|launch|start)\b|\bopportunit|\bgaps? in the market\b|\bunderserved\b|\bwhat to build\b|\bniches?\b/i;
function startThinking(q){
  const steps=GUIDE_Q.test(q)?["Checking the dataset…","Comparing companies…","Checking the market…"]:["Checking the dataset…","Comparing companies…"];
  $("#answer").innerHTML=`<div class="answer thinking"><canvas class="think-dots" aria-hidden="true"></canvas><p class="think-step" role="status" aria-live="polite">${steps[0]}</p></div>`;
  const cv=$("#answer .think-dots"),st=$("#answer .think-step"),ctx=cv.getContext("2d");
  const dpr=Math.min(2,devicePixelRatio||1),W=cv.clientWidth||300,H=44;cv.width=W*dpr;cv.height=H*dpr;ctx.scale(dpr,dpr);
  const col=getComputedStyle(document.documentElement).getPropertyValue("--brand").trim()||"#3DCB52";
  const G=9,cols=Math.max(1,Math.floor(W/G)),rows=Math.max(1,Math.floor(H/G)),ox=(W-(cols-1)*G)/2,oy=(H-(rows-1)*G)/2,cx=W/2,cy=H/2,t0=performance.now();
  let i=0;const timer=setInterval(()=>{if(!st.isConnected){clearInterval(timer);return}if(i<steps.length-1)st.textContent=steps[++i]},1700);
  const draw=now=>{
    if(!cv.isConnected){clearInterval(timer);return}
    const t=(now-t0)/1000;ctx.clearRect(0,0,W,H);ctx.fillStyle=col;
    for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
      const x=ox+c*G,y=oy+r*G,d=Math.hypot((x-cx)/W*3,(y-cy)/H*.8);
      // Reduced motion: one static frame of evenly sized dots.
      const wave=reduce?.5:.5+.5*Math.sin(d*7-t*4),fall=Math.max(0,1-d*.55);
      ctx.globalAlpha=.25+.75*wave*fall;ctx.beginPath();ctx.arc(x,y,.6+2.6*wave*fall,0,7);ctx.fill();
    }
    ctx.globalAlpha=1;if(!reduce)requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
}
async function ask(q){
  if([...q].length>ASK_MAX){showAnswer(`Please shorten your question to ${ASK_MAX} characters or less.`,[],"Search");return}
  const exact=items.find(d=>d.name.toLowerCase()===q.toLowerCase());
  if(exact){setHighlight([exact.id]);showAnswer(`${exact.name}: signal ${exact.included?exact.signal:"watchlist"}, trust ${exact.confidence}/5, strength ${exact.strength}/25.`,[exact.id],"Exact match");openDetail(exact.id);return}
  const local=localMatch(q);
  // Dataset first: a simple filter with matches never spends an AI question.
  if(!sample||(local.length&&!SYNTH.test(q))){searchResult(q,local);return}
  const btn=$("#askBtn"); btn.disabled=true; btn.textContent="Thinking…";
  startThinking(q);
  askCtl?.abort(); askCtl=new AbortController();
  try{
    const r=await sample.json(q,{signal:askCtl.signal});
    if(r?.mode==="ai"||r?.mode==="cached"){
      const ids=(Array.isArray(r.ids)?r.ids:[]).filter(id=>items.some(d=>d.id===id));
      if(ids.length)setHighlight(ids); else clearHighlight();
      const left=typeof r.remainingToday==="number"?` · ${r.remainingToday} AI ${r.remainingToday===1?"question":"questions"} left today`:"";
      const label=r.kind==="guidance"?"Market guidance, not advice: dataset plus a limited web check":"AI answer from the dataset";
      showAnswer(r.answer,ids,`${label}${left}`,r.sources);
      return;
    }
    // Fixed messages and limits: show the message, then fall back to free search on the same input.
    const wait=r?.retryAt?untilWord(r.retryAt):"";
    if(r?.reason==="too_long"||r?.reason==="off_topic"){clearHighlight();showAnswer(r.answer,[],"Search");return}
    searchResult(q,local,`${r?.answer||""}${wait?` More AI questions available in ${wait}.`:""}`.trim());
  }catch(err){
    if(err?.code==="cancelled")return;
    if(err?.code==="not_granted")sample=null;
    searchResult(q,local);
  }finally{btn.disabled=false;btn.textContent="Search"}
}

/* ---------- board ---------- */
function fillFilters(){
  [["fInd","industry"],["fRole","aiRole"],["fDig","digital"],["fForm","form"]].forEach(([id,k])=>{const el=$("#"+id);if(!el)return;OPT[k].forEach(o=>el.insertAdjacentHTML("beforeend",`<option>${esc(o)}</option>`));el.addEventListener("change",renderBoard)});
  $("#q").addEventListener("input",renderBoard);
  $("#legend").innerHTML=OPT.aiRole.map(r=>`<span style="--c:${ROLE_C[r]}">${roleName(r)}</span>`).join("");
}
function filtered(){const q=$("#q").value.trim().toLowerCase(),i=$("#fInd")?.value||"",r=$("#fRole").value,g=$("#fDig").value,f=$("#fForm").value;return items.filter(d=>(!q||[d.name,...(d.tags||[])].join(" ").toLowerCase().includes(q))&&(!i||d.industry===i)&&(!r||d.aiRole===r)&&(!g||d.digital===g)&&(!f||d.form===f)&&(!chip||CHIPS[chip][1](d)))}
// Header totals as one row of chips. Tapping one filters the list; tapping it again clears it.
let chip="";
const CHIPS={verified:["profit verified",d=>profitState(d)==="verified"],solid:["solid evidence",d=>d.confidence>=3],watch:["watchlist",d=>!d.included]};
function renderStats(){const el=$("#stats");if(!el)return;if(!items.length){el.innerHTML="";return}
  const b=(k,n,l)=>`<button type="button" class="schip" data-chip="${k}" aria-pressed="${chip===k}"><b>${n}</b> ${l}</button>`;
  el.innerHTML=b("",items.length,"tracked")+Object.entries(CHIPS).map(([k,[l,fn]])=>b(k,items.filter(fn).length,l)).join("")}
function renderBoard(){renderStats();syncFilt();const l=filtered();renderPlot(l);renderCohort(l);renderRows(l);$("#count").textContent=items.length?`${l.length} of ${items.length} shown`:""}
function renderPlot(list){
  const W2=640,H2=420,L=44,R=16,T=30,B=40,pw=W2-L-R,ph=H2-T-B,x=v=>L+v/25*pw,y=v=>T+ph-v/5*ph;
  let g=`<rect x="${x(12)}" y="${y(5)}" width="${x(25)-x(12)}" height="${y(3)-y(5)}" fill="var(--zone-good)"/><rect x="${x(12)}" y="${y(2.5)}" width="${x(25)-x(12)}" height="${y(0)-y(2.5)}" fill="var(--zone-hype)"/>
  <text class="zl" x="${x(12)+8}" y="${y(5)+16}" style="fill:#1E8F3A">Verified and strong</text><text class="zl" x="${x(24.6)}" y="${y(0)-10}" text-anchor="end" style="fill:var(--flag)">Strong claims, thin evidence</text>`;
  for(let i=0;i<=5;i++)g+=`<line x1="${L}" x2="${W2-R}" y1="${y(i)}" y2="${y(i)}" stroke="var(--line)"/><text x="${L-10}" y="${y(i)+4}" text-anchor="end">${i}</text>`;
  for(let i=0;i<=25;i+=5)g+=`<text x="${x(i)}" y="${H2-B+18}" text-anchor="middle">${i}</text>`;
  g+=`<line x1="${x(12)}" x2="${x(12)}" y1="${T}" y2="${T+ph}" stroke="var(--muted)" stroke-dasharray="4 4"/><line x1="${L}" x2="${W2-R}" y1="${y(2)}" y2="${y(2)}" stroke="var(--muted)" stroke-dasharray="4 4"/><text x="${L+pw/2}" y="${H2-4}" text-anchor="middle">Business strength (0 to 25)</text><text transform="translate(12 ${T+ph/2}) rotate(-90)" text-anchor="middle">Trust in the numbers (0 to 5)</text>`;
  const seen={},rowsUsed={};
  const pts=[...list].sort((a,b)=>a.confidence-b.confidence||a.strength-b.strength).map(d=>{const k=d.strength+"_"+d.confidence,n=seen[k]=(seen[k]||0)+1;return {d,cx:x(d.strength),cy:y(d.confidence)-(n-1)*14}});
  const rects=pts.map(p=>({x1:p.cx-9,x2:p.cx+9,y1:p.cy-9,y2:p.cy+9}));
  const ov=(a,b)=>a.x1<b.x2&&a.x2>b.x1&&a.y1<b.y2&&a.y2>b.y1;
  let labels="",dots="";
  pts.forEach(p=>{const w=p.d.name.length*6.4+4;let best=null;
    const cands=[];[0,-16,16,-30,30,-44,44,-58,58].forEach(dy=>{cands.push({side:1,dy});cands.push({side:-1,dy})});
    for(const c of cands){const lx=p.cx+c.side*11,ly=p.cy+4+c.dy;const r=c.side>0?{x1:lx,x2:lx+w,y1:ly-10,y2:ly+2}:{x1:lx-w,x2:lx,y1:ly-10,y2:ly+2};
      if(r.x2>W2-2||r.x1<L+2||r.y1<2||r.y2>T+ph)continue;
      if(!rects.some(q=>ov(q,r))){best={...c,lx,ly,r};break}}
    if(!best){const lx=p.cx+11,ly=p.cy+4;best={side:1,dy:0,lx,ly,r:{x1:lx,x2:lx+w,y1:ly-10,y2:ly+2}}}
    rects.push(best.r);
    const lead=best.dy!==0?`<line x1="${p.cx}" y1="${p.cy}" x2="${best.side>0?best.lx-2:best.lx+2}" y2="${best.ly-4}" stroke="var(--muted)" stroke-width=".8"/>`:"";
    labels+=`${lead}<text class="dl" x="${best.lx}" y="${best.ly}" text-anchor="${best.side>0?"start":"end"}">${esc(p.d.name)}</text>`;
    dots+=`<circle cx="${p.cx}" cy="${p.cy}" r="7" fill="${ROLE_C[p.d.aiRole]||"var(--none)"}" stroke="var(--panel)" stroke-width="2" tabindex="0" role="button" data-id="${esc(p.d.id)}" aria-label="${esc(p.d.name)}" style="cursor:pointer"/>`});
  g+=labels+dots;
  const svg=$("#plot");svg.innerHTML=g;
  svg.querySelectorAll("circle").forEach(c=>{c.addEventListener("click",()=>openDetail(c.dataset.id));c.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();openDetail(c.dataset.id)}})});
}
const median=a=>{if(!a.length)return 0;const s=[...a].sort((p,q)=>p-q),m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2};
function renderCohort(list){
  const groups={};list.forEach(d=>{const k=d[groupKey]||"Unclassified";(groups[k]=groups[k]||[]).push(d)});
  const o=OPT[groupKey]||[],idx=k=>o.indexOf(k)<0?99:o.indexOf(k);
  const keys=Object.keys(groups).sort((a,b)=>idx(a)-idx(b));
  $("#cohort").innerHTML=keys.length?keys.map(k=>{const g=groups[k],ms=median(g.map(d=>d.strength)),mc=median(g.map(d=>d.confidence));
    return `<div><div class="gname">${esc(groupKey==="aiRole"?roleName(k):k)}<small>${g.length} ${g.length===1?"company":"companies"}</small></div><div class="mbar"><span>Strength</span><div class="track"><div class="fill" style="width:${ms/25*100}%;background:var(--strength)"></div></div><span>${ms.toFixed(1)}</span></div><div class="mbar"><span>Trust</span><div class="track"><div class="fill" style="width:${mc/5*100}%;background:var(--trust)"></div></div><span>${mc.toFixed(1)}</span></div></div>`}).join(""):`<div class="empty">No companies match these filters.</div>`;
}
function renderRows(list){
  const el=$("#rows"),pod=$("#podium"); pod.hidden=true;pod.innerHTML=""; if(!db)return;
  if(!items.length){el.innerHTML=`<div class="empty">No companies yet. ${canWrite?"Add one, or send a research batch through the agent API.":"Ask the owner to add companies."}</div>`;return}
  const s=[...list].sort((a,b)=>sortKey==="name"?(a.name||"").localeCompare(b.name||""):(b[sortKey]-a[sortKey])||(b.signal-a.signal));
  if(!s.length){el.innerHTML=`<div class="empty">No companies match these filters. Clear the search or filters to see everything.</div>`;return}
  // Global rank by signal (watchlist entries are unranked), so numbers stay put when filtering.
  const rk=new Map(items.filter(d=>d.included).sort((a,b)=>b.signal-a.signal).map((d,i)=>[d.id,i+1]));
  // Podium: the top 3 on the plain ranking only. The list then continues from #4 so nothing repeats.
  const top=sortKey==="signal"&&list.length===items.length?s.filter(d=>d.included).slice(0,3):[];
  if(top.length===3){pod.hidden=false;pod.innerHTML=top.map(d=>`<button type="button" class="pod" data-id="${esc(d.id)}"><span class="pr">#${rk.get(d.id)}</span>${icoHTML(d,"ico")}<span class="pn">${esc(d.name)}</span><span class="ps">${d.signal}</span><span class="pl">Signal</span></button>`).join("");
    pod.querySelectorAll(".pod").forEach(b=>b.addEventListener("click",()=>openDetail(b.dataset.id)))}
  const rest=top.length===3?s.filter(d=>!top.includes(d)):s;
  el.innerHTML=rest.map(d=>`<div class="row" tabindex="0" role="button" data-id="${esc(d.id)}"><div class="nm"><span class="rk">${rk.get(d.id)||"–"}</span>${icoHTML(d,"ico ico-s")}<div style="min-width:0">${esc(d.name)}<small>${esc(d.form||"")}${d.customer?" for "+esc(d.customer):""}${markHTML(d)}</small></div></div><div class="c-role"><span class="role" style="--c:${ROLE_C[d.aiRole]||"var(--none)"}">${esc(roleName(d.aiRole))}</span></div><div class="c-conf"><span class="bpips" aria-label="Trust ${d.confidence} of 5">${[1,2,3,4,5].map(i=>`<i class="${i<=d.confidence?"on":""}"></i>`).join("")}</span><small class="tw">${esc(TRUST_WORD[d.confidence])}</small></div><div class="c-str"><div class="sbar"><div class="track"><div class="fill" style="width:${d.strength/25*100}%;background:var(--strength)"></div></div><span>${d.strength}</span></div></div><div class="sigc">${d.included?`<div class="sig">${d.signal}</div>`:`<span class="watch">Watchlist</span>`}</div><div class="meta"><span>${esc(roleName(d.aiRole))}</span><span>Trust ${d.confidence}/5</span><span>Strength ${d.strength}/25</span></div></div>`).join("");
  el.querySelectorAll(".row").forEach(r=>{r.addEventListener("click",()=>openDetail(r.dataset.id));r.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();openDetail(r.dataset.id)}})});
}
$("#lhead").addEventListener("click",e=>{const b=e.target.closest("[data-sort]");if(!b)return;sortKey=b.dataset.sort;document.querySelectorAll("[data-sort]").forEach(x=>x.removeAttribute("aria-sort"));b.setAttribute("aria-sort","descending");renderBoard()});
$("#seg").addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;groupKey=b.dataset.k;$("#seg").querySelectorAll("button").forEach(x=>x.setAttribute("aria-pressed",x===b));renderBoard()});
// One quiet marker: "New" for companies added in the last 14 days. (No "updated" marker: background re-checks touch
// most records daily, so it would show on nearly every row.)
const isNewCo=d=>{const t=Date.parse(d.addedAt||"");return Number.isFinite(t)&&Date.now()-t<14*864e5};
const markHTML=d=>isNewCo(d)?`<span class="mk new">New</span>`:"";
$("#stats").addEventListener("click",e=>{const c=e.target.closest("[data-chip]");if(!c)return;const k=c.dataset.chip;chip=chip===k?"":k;renderBoard()});
// Mobile filters: the four dropdowns live in a bottom sheet behind one button that shows how many are set.
const FILT_IDS=["fInd","fRole","fDig","fForm"];
function syncFilt(){const b=$("#filtBtn");if(!b)return;const n=FILT_IDS.filter(id=>$("#"+id)?.value).length;b.innerHTML=`Filters${n?` <span class="fn">${n}</span>`:""}`}
const setFilt=o=>{$("#toolbar").classList.toggle("open",o);document.body.classList.toggle("filt-open",o);$("#filtBtn").setAttribute("aria-expanded",String(o))};
$("#filtBtn").addEventListener("click",()=>setFilt(!$("#toolbar").classList.contains("open")));
$("#fDone").addEventListener("click",()=>setFilt(false));
$("#fClear").addEventListener("click",()=>{FILT_IDS.forEach(id=>{const el=$("#"+id);if(el)el.value=""});renderBoard()});
// Tapping outside the Filters sheet only closes it: the tap must not also open whatever row is underneath.
document.addEventListener("pointerdown",e=>{if($("#toolbar").classList.contains("open")&&!e.target.closest("#toolbar,#fsheet")){setFilt(false);
  const eat=ev=>{ev.preventDefault();ev.stopPropagation()};document.addEventListener("click",eat,{capture:true,once:true});setTimeout(()=>document.removeEventListener("click",eat,true),600)}});
// The search/filter bar sticks just under the floating nav.
// On phones/iPads the nav box is display:contents (its pills are positioned individually), so measure the pills.
const setNavH=()=>{const n=$(".nav");if(!n)return;let b=n.getBoundingClientRect().bottom;
  if(getComputedStyle(n).display==="contents")b=Math.max(0,...[...n.children].map(c=>c.getBoundingClientRect().bottom))+14;
  document.documentElement.style.setProperty("--navh",Math.round(b)+"px")};
addEventListener("resize",setNavH);setNavH();
// Phones + iPads: once the search/filter bar scrolls under the nav, it glides into a glass footer; scrolling back
// up returns it. A spacer holds its place so the page doesn't jump, and a FLIP animation moves it between spots.
const DOCK_MQ=matchMedia("(max-width:1024px), (hover:none) and (pointer:coarse)");
const tbEl=$("#toolbar"),tbSpace=document.createElement("div");tbSpace.setAttribute("aria-hidden","true");tbEl.before(tbSpace);
let docked=false,dockRaf=null,inlineH=0;
let moveRaf=0;
// Animate el from where it was to where change() puts it. If it was already off-screen (a fast scroll carried it away),
// slide it up from the bottom edge instead of flying it across the whole screen.
function flipMove(el,change,dockingNow){
  cancelAnimationFrame(moveRaf);el.style.transition="none";el.style.transform="";el.style.opacity="";
  const a=el.getBoundingClientRect();change();if(reduce)return;const b=el.getBoundingClientRect();
  const offscreen=a.bottom<0||a.top>innerHeight;
  el.style.transform=dockingNow&&offscreen?`translateY(${innerHeight-b.top}px)`:`translate(${a.left-b.left}px,${a.top-b.top}px)`;
  if(dockingNow&&offscreen)el.style.opacity="0";
  moveRaf=requestAnimationFrame(()=>{moveRaf=requestAnimationFrame(()=>{
    el.style.transition="transform .5s var(--spring),opacity .25s ease";el.style.transform="";el.style.opacity="";
    el.addEventListener("transitionend",e=>{if(e.propertyName==="transform")el.style.transition=""},{once:true});
  })});
}
function updateDock(){
  dockRaf=null;
  const navh=parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--navh"))||84;
  // Measure the bar's in-flow footprint while it's inline; the spacer's top never moves, so docking can't flicker.
  if(!docked)inlineH=tbEl.offsetHeight; // its bottom margin collapses into the heading below, so it is not added
  const want=DOCK_MQ.matches&&!$("#board").hidden&&tbSpace.getBoundingClientRect().top+inlineH<navh;
  if(want===docked)return;
  if(tbEl.classList.contains("open"))setFilt(false);
  flipMove(tbEl,()=>{tbSpace.style.height=want?inlineH+"px":"";docked=want;tbEl.classList.toggle("docked",want)},want);
}
// The Explore/Board toggle sits in a wrapper that turns to glass once the page starts scrolling (styled on phones/iPads).
{const t=$(".tabs");if(t&&!t.parentElement.classList.contains("tabwrap")){const w=document.createElement("div");w.className="tabwrap";t.before(w);w.appendChild(t)}}
const setScrolled=()=>document.body.classList.toggle("scrolled",scrollY>8);
addEventListener("scroll",()=>{setScrolled();if(!dockRaf)dockRaf=requestAnimationFrame(updateDock)},{passive:true});setScrolled();
// On phones/iPads the Filters sheet lives in <body>, so the docked bar can carry its own blur (see globals.css).
function placeFsheet(){const fs=$("#fsheet");if(!fs)return;const home=DOCK_MQ.matches?document.body:tbEl;if(fs.parentElement!==home)home.appendChild(fs)}
placeFsheet();
// Explore on phones/iPads: keep the page scrolled to the bottom so the canvas's extra top sits under the status bar.
function pinExplore(){
  if(!DOCK_MQ.matches||$("#explore").hidden||document.body.classList.contains("kb-open"))return;
  const max=document.documentElement.scrollHeight-innerHeight;if(max>0&&Math.abs(scrollY-max)>1)scrollTo(0,max);
}
addEventListener("scroll",()=>{if(!$("#explore").hidden)pinExplore()},{passive:true});
addEventListener("resize",()=>requestAnimationFrame(pinExplore));
DOCK_MQ.addEventListener?.("change",()=>{placeFsheet();updateDock();pinExplore()});
// Near the bottom of the Board the docked search/filter bar would sit on top of the footer. Hide it while the footer
// is in view and bring it back when scrolling up. Never while the Filters sheet is open.
{const foot=document.querySelector(".site-foot");
  if(foot&&"IntersectionObserver" in window)new IntersectionObserver(es=>{for(const e of es)document.body.classList.toggle("foot-near",e.isIntersecting)},{rootMargin:"0px 0px -24px 0px"}).observe(foot)}

/* ---------- sheet: detail + form ---------- */
let lastFocus=null;
function openSheet(html){lastFocus=document.activeElement;$("#sheetIn").innerHTML=html;$("#sheet").classList.add("on");$("#scrim").classList.add("on");setTimeout(()=>$("#sheetIn").querySelector("button,input")?.focus(),60)}
function closeSheet(){$("#sheet").classList.remove("on");$("#scrim").classList.remove("on");lastFocus?.focus?.()}
$("#scrim").addEventListener("click",closeSheet);
addEventListener("keydown",e=>{if(e.key==="Escape"&&$("#sheet").classList.contains("on"))closeSheet()});

const TRUST_WORD=["No revenue evidence","Founder post or single source","Company claim or estimate","Company results or reputable press","Regulatory or acquirer filing","Audited filing"];

/* ---------- evidence freshness ----------
   STALE_DAYS matches lib/rechecks.ts, so what the public sees lines up with what agents are asked to re-check. */
const STALE_DAYS=90;
const daysSince=iso=>{const t=Date.parse(iso||"");return Number.isFinite(t)?Math.floor((Date.now()-t)/864e5):null};
const agoWord=d=>d<=0?"today":d===1?"yesterday":d<30?`${d} days ago`:d<60?"a month ago":d<365?`${Math.round(d/30)} months ago`:d<730?"over a year ago":"over 2 years ago";
// When an entry was last confirmed against its source. Never-checked and past-threshold both read as a warning.
function ageHTML(e){
  const d=daysSince(e.lastCheckedAt);
  if(d===null)return `<span class="age warn" title="Added but never re-checked against the source.">Never re-checked</span>`;
  if(e.lastCheckStatus==="needs review")return `<span class="age warn" title="The last re-check could not confirm this figure.">Unconfirmed, checked ${esc(agoWord(d))}</span>`;
  if(d>STALE_DAYS)return `<span class="age warn" title="Older than the ${STALE_DAYS}-day re-check window.">Last checked ${esc(agoWord(d))}</span>`;
  return `<span class="age">Verified ${esc(agoWord(d))}</span>`;
}
// A figure for a period before the current year may have been superseded by a newer release.
const periodYear=p=>{const m=String(p||"").match(/(19|20)\d{2}/g);return m?Math.max(...m.map(Number)):null};
function periodHTML(e){
  const y=periodYear(e.period);
  if(!y||y>=new Date().getFullYear())return "";
  return `<span class="tag soft" title="This figure covers ${y}. A more recent period may now be published.">Newer period may exist</span>`;
}
const strengthWord=v=>v>=20?"Very strong":v>=15?"Strong":v>=12?"Moderate":"Too early to call";
// Must match lib/rubric.ts: "Verified losses: ..." starts with "Verified" but is a verified loss, not verified profit.
const VERIFIED_LOSS=/^verified\W*(net\s+|operating\s+|gaap\s+|annual\s+)?loss/i;
function profitState(d){const p=(d.profitability||"").trim();if(VERIFIED_LOSS.test(p))return "loss";return /^verified/i.test(p)?"verified":/claim|company-reported|self-reported/i.test(p)?"claimed":"none"}
const PROFIT_HEAD={verified:"Profit verified",loss:"Verified loss",claimed:"Profit claimed, not verified",none:"Profit not verified"};
function openDetail(id){
  const d=items.find(i=>i.id===id);if(!d)return;
  const e=(d.evidence||[])[0]||{},ps=profitState(d),sc=d.scores||{};
  const bar=(label,v,max,word)=>`<div class="vrow"><span class="vl">${label}</span><div class="vtrack"><span style="width:${v/max*100}%"></span></div><span class="vw"><b>${v}/${max}</b>${word?" "+esc(word):""}</span></div>`;
  const ev=(d.evidence||[]).map(x=>{const u=safeUrl(x.url);return `<li><div class="ev-v"><b>${esc(x.value)}</b><span>${esc(x.metric)}${x.period?", "+esc(x.period):""}</span>${periodHTML(x)}</div><div class="ev-s"><span>${esc(x.tier)}</span>${x.selfReported?'<span class="tag">Self-reported</span>':""}${u?`<a href="${esc(u)}" target="_blank" rel="noopener">${esc(x.source||"Source")} ↗</a>`:(x.source?`<span>${esc(x.source)}</span>`:"")}${ageHTML(x)}</div></li>`}).join("");
  const fact=(k,v)=>v?`<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`:"";
  openSheet(`<div class="dh"><div class="dh-id">${icoHTML(d,"ico")}<div><h3>${esc(d.name)}</h3><p class="dh-sub">${esc(d.form||"")}${d.customer?" · "+esc(d.customer):""} · <span class="role" style="--c:${ROLE_C[d.aiRole]||"var(--none)"}">${esc(roleName(d.aiRole))}</span></p></div></div><div class="dh-act">${safeUrl(d.website)?`<a class="btn visit" href="${esc(d.website)}" target="_blank" rel="noopener noreferrer">Visit site <span aria-hidden="true">↗</span></a>`:""}<button class="xbtn" data-close aria-label="Close"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" fill="none"/></svg></button></div></div>
  <section class="verdict">
    <div class="v-top"><div class="v-fig"><div class="v-num">${esc(e.value||"No figure yet")}</div><div class="v-cap">${esc(e.metric||"")}${e.period?", "+esc(e.period):""}${e.selfReported?' <span class="tag">Self-reported</span>':""}</div></div>
    <div class="v-sig">${d.included?`<span>Signal</span><b>${d.signal}</b>`:`<span>Status</span><b class="watch">Watchlist</b>`}</div></div>
    ${d.summary?`<p class="v-sum">${esc(d.summary)}</p>`:""}
    <div class="vbars">${bar("Trust in the numbers",d.confidence,5,TRUST_WORD[d.confidence])}${bar("Business strength",d.strength,25,strengthWord(d.strength))}</div>
  </section>
  <div class="pf pf-${ps}"><span class="pf-dot" aria-hidden="true"></span><div><b>${PROFIT_HEAD[ps]}</b>${/^not publicly verified\.?$/i.test((d.profitability||"").trim())||!d.profitability?"":`<span>${esc(d.profitability)}</span>`}</div></div>
  <div class="cols">${d.trigger?`<section class="sec"><h4>Why it's on the list</h4><p>${esc(d.trigger)}</p></section>`:""}${d.caveats?`<section class="sec"><h4>What could make this wrong</h4><p>${esc(d.caveats)}</p></section>`:""}</div>
  ${(d.flags||[]).length?`<section class="sec"><h4>Watch-outs</h4><div class="flags">${d.flags.map(f=>`<span>${esc(f)}</span>`).join("")}</div></section>`:""}
  <section class="sec"><h4>Score breakdown</h4><div class="vbars">${DIMS.map(([k,l])=>bar(l,num(sc[k]),5,"")).join("")}</div></section>
  <section class="sec"><h4>Evidence</h4>${ev?`<ul class="evl">${ev}</ul>`:"<p>No evidence logged yet.</p>"}</section>
  ${(d.tags||[]).length?`<section class="sec"><h4>Tags</h4><div class="flags">${d.tags.map(t=>`<span>${esc(t)}</span>`).join("")}</div></section>`:""}
  <section class="sec"><h4>Details</h4><dl class="facts">${fact("Industry",d.industry)}${fact("Ecosystem role",d.ecosystemRole)}${d.entityType==="product"&&d.parentCompany?fact("Product of",d.parentCompany):""}${safeUrl(d.website)?`<div><dt>Website</dt><dd><a class="wlink" href="${esc(d.website)}" target="_blank" rel="noopener noreferrer">${esc(d.website.replace(/^https?:\/\/(www\.)?/,"").replace(/\/$/,""))} ↗</a></dd></div>`:""}${fact("Revenue model",d.model)}${fact("Customer",d.customer)}${fact("Digital intensity",d.digital)}${fact("Launched",d.launched)}${fact("Re-check when",d.recheck)}</dl></section>
  <div class="actions">${location.hash!=="#board"?`<a class="btn" href="#board" data-goboard>See it on the board</a>`:""}${canWrite?`<button class="btn danger" data-del>Delete</button><button class="btn primary" data-edit>Edit</button>`:""}</div>`);
  const sh=$("#sheetIn");
  sh.querySelector("[data-close]").addEventListener("click",closeSheet);
  sh.querySelector("[data-goboard]")?.addEventListener("click",()=>{closeSheet();setTimeout(()=>{$("#q").value=d.name;renderBoard()},50)});
  sh.querySelector("[data-edit]")?.addEventListener("click",()=>openForm(d));
  sh.querySelector("[data-del]")?.addEventListener("click",async ev2=>{const t=ev2.target;if(t.dataset.c!=="1"){t.dataset.c="1";t.textContent="Click again to delete";return}try{await db.collection("companies").doc(d.id).delete();closeSheet()}catch{t.textContent="Couldn't delete. Try again."}});
}
const sel=(n,o,v)=>`<select name="${n}">${o.map(x=>`<option ${String(x)===String(v)?"selected":""}>${esc(x)}</option>`).join("")}</select>`;
// Same as sel, with a "Not set" first option for optional fields.
const selOpt=(n,o,v)=>`<select name="${n}"><option value="" ${v?"":"selected"}>Not set</option>${o.map(x=>`<option ${String(x)===String(v)?"selected":""}>${esc(x)}</option>`).join("")}</select>`;
const ECO=["End product","Platform","Enabling tool","Infrastructure","Marketplace","Service layer"];
const evRow=(e={})=>`<div class="evrow"><input name="ev_metric" placeholder="Metric" value="${esc(e.metric)}" aria-label="Metric"><input name="ev_value" placeholder="Value" value="${esc(e.value)}" aria-label="Value"><input name="ev_period" placeholder="Period" value="${esc(e.period)}" aria-label="Period">${sel("ev_type",OPT.metricType,e.type||"Revenue")}${sel("ev_tier",OPT.tier,e.tier||"Reputable press")}<input name="ev_source" placeholder="Source name" value="${esc(e.source)}" aria-label="Source name"><input name="ev_url" placeholder="https://" value="${esc(e.url)}" aria-label="Source link" style="grid-column:1/-1"><label style="display:flex;gap:6px;align-items:center;color:var(--ink);font-size:13px"><input type="checkbox" name="ev_self" ${e.selfReported?"checked":""} style="width:auto"> Self-reported</label><button type="button" class="x">Remove row</button></div>`;
function openForm(d){
  const isNew=!d;d=d||{scores:{},flags:[],evidence:[{}],confidence:2};const s=d.scores||{};
  openSheet(`<div class="sh-head"><h3 style="font-size:30px">${isNew?"Add company":"Edit "+esc(d.name)}</h3><button class="xbtn" data-close aria-label="Close"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" fill="none"/></svg></button></div>
  <form id="f" novalidate><div class="fgrid" style="margin-top:14px">
    <label class="full">Name<input name="name" value="${esc(d.name)}"></label>
    <label>Product form${sel("form",OPT.form,d.form)}</label><label>Customer${sel("customer",OPT.customer,d.customer)}</label>
    <label>Revenue model${sel("model",OPT.model,d.model)}</label><label>Digital intensity${sel("digital",OPT.digital,d.digital)}</label>
    <label>AI role${sel("aiRole",OPT.aiRole,d.aiRole||"None")}</label><label>Launched or broke out<input name="launched" value="${esc(d.launched)}"></label>
    <label>Industry${selOpt("industry",OPT.industry,d.industry)}</label><label>Ecosystem role${selOpt("ecosystemRole",ECO,d.ecosystemRole)}</label>
    <label>Tracked as${sel("entityType",["company","product"],d.entityType||"company")}</label><label>Parent company (products only)<input name="parentCompany" value="${esc(d.parentCompany)}" placeholder="e.g. Anthropic"></label>
    <label class="full">Tags (comma separated; matching existing tags are reused)<input name="tags" value="${esc((d.tags||[]).join(", "))}" placeholder="e.g. Subscription, Prosumer"></label>
    <label class="full">Website<input name="website" type="url" inputmode="url" placeholder="https://" value="${esc(d.website)}"></label>
    <label class="full">Why it qualifies now<input name="trigger" value="${esc(d.trigger)}"></label></div>
    <fieldset><legend>Scores</legend><div class="dimgrid"><label>Trust in the numbers${sel("confidence",[0,1,2,3,4,5],d.confidence)}</label>${DIMS.map(([k,l])=>`<label>${l}${sel("s_"+k,[0,1,2,3,4,5],num(s[k]))}</label>`).join("")}</div><div class="live" id="live"></div></fieldset>
    <div class="fgrid" style="margin-top:14px"><label class="full">Profitability<input name="profitability" value="${esc(d.profitability)}" placeholder="Not publicly verified."></label><label class="full">Signal summary<textarea name="summary">${esc(d.summary)}</textarea></label><label class="full">Caveats<textarea name="caveats">${esc(d.caveats)}</textarea></label><label class="full">Re-check when<input name="recheck" value="${esc(d.recheck)}"></label></div>
    <fieldset><legend>Flags</legend><div class="flagchecks">${OPT.flags.map(f=>`<label><input type="checkbox" name="flag" value="${esc(f)}" ${(d.flags||[]).includes(f)?"checked":""}> ${esc(f)}</label>`).join("")}</div></fieldset>
    <fieldset><legend>Evidence</legend><div id="evs">${(d.evidence&&d.evidence.length?d.evidence:[{}]).map(evRow).join("")}</div><button type="button" class="btn" id="addEv">Add evidence row</button></fieldset>
    <div class="err" id="ferr" role="alert"></div><div class="actions"><button type="submit" class="btn primary">${isNew?"Add company":"Save changes"}</button></div></form>`);
  const f=$("#f");
  const live=()=>{const t=derive(collect(f));$("#live").innerHTML=`Strength <b>${t.strength}/25</b> · Signal <b>${t.included?t.signal:"watchlist"}</b>${t.included?"":" (needs trust of 2 or more and strength of 12 or more)"}`};
  f.addEventListener("change",live);live();
  $("#sheetIn [data-close]").addEventListener("click",()=>isNew?closeSheet():openDetail(d.id));
  $("#addEv").addEventListener("click",()=>$("#evs").insertAdjacentHTML("beforeend",evRow()));
  $("#evs").addEventListener("click",e=>{if(e.target.classList.contains("x"))e.target.closest(".evrow").remove()});
  f.addEventListener("submit",async e=>{e.preventDefault();const data=collect(f);if(!data.name){$("#ferr").textContent="Add a company name to save.";return}
    const id=d.id||data.name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,60)||"co-"+Date.now();
    const b=f.querySelector("[type=submit]");b.disabled=true;
    try{await db.collection("companies").doc(id).set({...data,updatedAt:new Date().toISOString()});let n=0;const t=setInterval(()=>{if(items.find(i=>i.id===id)||n++>20){clearInterval(t);openDetail(id)}},100)}
    catch(err){b.disabled=false;$("#ferr").textContent=err?.code==="quota_exceeded"?"The ledger is full. Delete some entries, then save again.":(err?.message||"Couldn't save. Check your connection and try again.")}});
}
function collect(f){const fd=new FormData(f),g=k=>(fd.get(k)||"").toString().trim();
  const ev=[...f.querySelectorAll(".evrow")].map(r=>({metric:r.querySelector("[name=ev_metric]").value.trim(),value:r.querySelector("[name=ev_value]").value.trim(),period:r.querySelector("[name=ev_period]").value.trim(),type:r.querySelector("[name=ev_type]").value,tier:r.querySelector("[name=ev_tier]").value,source:r.querySelector("[name=ev_source]").value.trim(),url:r.querySelector("[name=ev_url]").value.trim(),selfReported:r.querySelector("[name=ev_self]").checked})).filter(e=>e.metric||e.value);
  // Optional classification fields: null means "clear it" (the server drops null keys).
  const entityType=g("entityType")||"company";
  const cls={industry:g("industry")||null,ecosystemRole:g("ecosystemRole")||null,entityType,parentCompany:entityType==="product"&&g("parentCompany")?g("parentCompany"):null,tags:g("tags").split(",").map(t=>t.trim()).filter(Boolean)};
  return {...cls,name:g("name"),form:g("form"),customer:g("customer"),model:g("model"),digital:g("digital"),aiRole:g("aiRole"),launched:g("launched"),website:/^https?:\/\//i.test(g("website"))?g("website"):(g("website")?"https://"+g("website"):""),trigger:g("trigger"),confidence:Number(g("confidence")),scores:Object.fromEntries(DIMS.map(([k])=>[k,Number(g("s_"+k))])),profitability:g("profitability")||"Not publicly verified.",summary:g("summary"),caveats:g("caveats"),recheck:g("recheck"),flags:fd.getAll("flag").map(String),evidence:ev}}
$("#addBtn").addEventListener("click",()=>openForm(null));

/* ---------- first-load intro: fisheye bulge of the grid ----------
   The tiles themselves start bulged out from the screen centre, as if seen through a fisheye lens, and relax
   back into the flat grid with a small springy overshoot. It is real geometry in paint() (each tile's position
   and size), not an image filter, so it works the same in every browser and on phones.
   Once per browser session, only on Explore, skipped for reduced motion. The nav and search bar are usable
   throughout. */
function playIntro(){
  if(reduce||location.hash==="#board")return;
  try{if(sessionStorage.getItem("mm_intro"))return;sessionStorage.setItem("mm_intro","1")}catch{}
  const D=1500,t0=performance.now();
  // Damped spring: starts fully bulged (1), dips slightly past flat (a brief pinch) and settles at 0.
  const spring=t=>Math.exp(-4.2*t)*Math.cos(5.2*t);
  lensK=1;field.style.opacity="0";
  const step=now=>{
    const t=Math.min(1,(now-t0)/D),s=(now-t0)/1000;
    lensK=t<1?spring(s):0;
    field.style.opacity=String(Math.min(1,(now-t0)/260)); // fade in fast so the bulge is the first thing seen
    paint();
    if(t<1)requestAnimationFrame(step);else{lensK=0;field.style.opacity="";paint()}
  };
  requestAnimationFrame(step);
  setTimeout(()=>{if(lensK!==0||field.style.opacity){lensK=0;field.style.opacity="";paint()}},D+800); // never leave it distorted
}

/* ---------- boot (Vercel version) ---------- */
// Reads come from the server. Owner writes go to /api/admin/companies/:id. Same Firestore-style surface the original code expects.
let lastData=JSON.stringify(opts.initial||[]),lastVersion=null,lastSync=0,flashT=null;
function renderAge(msg){const el=$("#liveAge");if(!el)return;if(msg){el.textContent=" · "+msg;return}const s=Math.round((Date.now()-lastSync)/1000);el.textContent=" · "+(s<60?"updated just now":s<3600?`updated ${Math.floor(s/60)}m ago`:`updated ${Math.floor(s/3600)}h ago`)}
function markSynced(changed){lastSync=Date.now();const d=document.querySelector(".live-dot");if(changed&&d){d.classList.remove("burst");void d.offsetWidth;d.classList.add("burst");renderAge("new data");clearTimeout(flashT);flashT=setTimeout(()=>{flashT=null;renderAge()},6000)}else if(!flashT)renderAge()}
async function refresh(){
  try{const r=await fetch("/api/companies",{cache:"no-store"});if(!r.ok)return;const j=await r.json();const s=JSON.stringify(j.companies||[]);if(s===lastData)return;lastData=s;items=(j.companies||[]).map(derive);renderBoard();buildField()}catch{}
}
// Open tabs stay current: check a tiny version hash, and download the dataset only when it changed.
async function checkVersion(){
  if(document.hidden)return;
  try{const r=await fetch("/api/version",{cache:"no-store"});if(!r.ok)return;const {version}=await r.json();
    if(lastVersion===null){lastVersion=version;markSynced(false);return}
    if(version!==lastVersion){lastVersion=version;await refresh();markSynced(true)}else markSynced(false)}catch{}
}
async function send(method,id,body){
  const r=await fetch(`/api/admin/companies/${encodeURIComponent(id)}`,{method,headers:{"content-type":"application/json"},body:body?JSON.stringify(body):undefined});
  if(!r.ok){const j=await r.json().catch(()=>({}));const err=new Error(j.error||"Couldn't save. Try again.");err.code=j.code;throw err}
  await refresh();
}
db={collection:()=>({doc:id=>({set:data=>send("PUT",id,data),delete:()=>send("DELETE",id)})})};
sample=opts.askEnabled?{async json(q,{signal}={}){
  let r;
  try{r=await fetch("/api/ask",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({q}),signal})}
  catch(e){const err=new Error("cancelled");err.code=e?.name==="AbortError"?"cancelled":"network";throw err}
  if(!r.ok){const err=new Error("failed");err.code=r.status===404?"not_granted":"failed";throw err}
  return r.json(); // always {mode, answer, ...}; see app/api/ask/route.ts
}}:null;
canWrite=!!opts.canWrite;
fillFilters(); route();
items=(opts.initial||[]).map(derive);
$("#addBtn").hidden=!canWrite;
// Live status: rippling dot + "updated X ago" that resets on every successful sync; a stronger pulse when data changes.
const liveLabel=canWrite?"Signed in as owner · Live":"Live data";
$("#status").innerHTML=`<span class="live"><span class="live-dot" aria-hidden="true"><i></i></span><span>${liveLabel}</span><span class="live-age" id="liveAge"></span></span>`;
lastSync=Date.now();renderAge();setInterval(()=>{if(!flashT)renderAge()},30000);
if(canWrite){$("#addBtn").insertAdjacentHTML("beforebegin",`<a class="btn" href="/admin/review" style="text-decoration:none">Review queue</a>`)}
playIntro(); // before the canvas fills, so tiles never flash at full size first
renderBoard(); buildField();
checkVersion();
addEventListener("focus",checkVersion);
document.addEventListener("visibilitychange",()=>{if(!document.hidden)checkVersion()});
setInterval(checkVersion,240000);
}
