import type { Result } from './types.js';

// JSON is embedded as a non-executable script payload; escape markup and JS separator chars.
const safeJSON = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
export function renderReport(result: Result): string {
  const data = safeJSON(result);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'">
<title>VibePreflight · Offline release surface</title>
<style>
:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,Arial,sans-serif;background:#080d1b;color:#edf2ff}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 75% -10%,#17365c 0,transparent 42%),#080d1b;min-height:100vh}
main{max-width:1250px;margin:auto;padding:42px 24px 72px}
header{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
.logo{font-size:15px;font-weight:850;letter-spacing:.16em;color:#8ddcf2}
.pill{background:#122c3c;border:1px solid #245a6c;border-radius:30px;padding:8px 14px;color:#9eecdd;font-size:12px}
h1{font-size:clamp(34px,5vw,64px);letter-spacing:-.05em;line-height:1.05;margin:46px 0 10px}
.sub{color:#91a2be;max-width:700px;line-height:1.7}.muted{color:#92a3bd}
.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:34px 0}
.metric,.panel{background:#101b2c;border:1px solid #26394e;border-radius:18px}
.metric{padding:20px}.metric strong{display:block;font-size:32px;letter-spacing:-.05em}.metric span{font-size:12px;color:#a3b3ce}
.layout{display:grid;grid-template-columns:1.5fr 1fr;gap:16px}.panel{padding:22px;min-width:0}
.panel h2{font-size:17px;margin:0 0 18px}.tabs{display:flex;gap:8px;flex-wrap:wrap;margin:15px 0}
button{cursor:pointer;background:#17283f;border:1px solid #334760;border-radius:20px;color:#bbcadf;padding:7px 12px}
button.active{background:#1c697d;color:#fff;border-color:#43a8bc}
svg{max-width:100%;width:100%;height:390px;background:#0b1524;border-radius:14px;border:1px solid #22344a}
.node{cursor:pointer;transition:opacity .15s}.node:hover{opacity:.75}
.item{padding:13px 0;border-bottom:1px solid #26364b}.item:last-child{border-bottom:0}
.item b{font-size:13px}.item small{display:block;color:#93a9c1;margin-top:6px;line-height:1.5}
.tag{font-size:10px;font-weight:800;padding:4px 7px;border-radius:6px;margin-right:6px}
.high{background:#502635;color:#ff9fac}.medium{background:#4b391d;color:#f9d08e}.info{background:#1f374c;color:#9dd0fb}
footer{color:#7086a1;margin-top:24px;font-size:12px;line-height:1.6}
@media(max-width:800px){.layout{grid-template-columns:1fr}.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}main{padding:25px 15px 50px}}
</style></head><body><main>
<header><div class="logo">◇ VIBEPREFLIGHT <span class="muted">/ RELEASE MAP</span></div><span class="pill">● LOCAL-FIRST · OFFLINE</span></header>
<h1>Know what you<br>are about to ship.</h1><p class="sub">A visual inventory of your release surface — routes, environment variables, and deployment entrypoints. Informational heuristics, not a security certification.</p>
<section class="metrics" id="metrics"></section>
<div class="layout"><section class="panel"><h2>Release surface map</h2><p class="muted">Select a node for details. Filter the map by type.</p><div id="tabs" class="tabs"></div><svg id="map" role="img" aria-label="Interactive release surface graph" viewBox="0 0 680 390"></svg><p id="selection" class="muted" aria-live="polite"></p></section>
<section class="panel"><h2>Signals requiring attention</h2><div id="findings"></div></section></div>
<footer>VibePreflight · Static local inspection · No uploads or execution · A clean scan does not imply a secure deployment.<div id="limitations"></div></footer>
</main><script>
const report = ${data};
const el = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const types=['all','route','env','deployment','framework'];
const tones={route:'#59d9df',env:'#b7a4fd',deployment:'#f7bc72',framework:'#7ddbb4'};
let filter='all';
el('metrics').innerHTML=[['Hygiene signal',report.signalScore+'/100'],['Files inspected',report.scannedFiles],['Graph nodes',report.nodes.length],['Findings',report.findings.length]]
.map(([name,value])=>'<div class="metric"><strong>'+esc(value)+'</strong><span>'+esc(name)+'</span></div>').join('');
el('findings').innerHTML=report.findings.length?report.findings.map(f=>'<div class="item"><span class="tag '+esc(f.severity)+'">'+esc(f.severity.toUpperCase())+'</span><b>'+esc(f.title)+'</b><small>'+esc(f.file)+':'+esc(f.line)+' · '+esc(f.explanation)+'</small><small><b>Next:</b> '+esc(f.fix)+'</small></div>').join(''):'<p class="muted">No supported heuristic warnings. This does not establish security.</p>';
el('limitations').textContent=report.limitations.join(' · ');
const svgNS='http://www.w3.org/2000/svg';
function svgNode(tag,attrs,txt){const n=document.createElementNS(svgNS,tag);for(const [key,val] of Object.entries(attrs))n.setAttribute(key,String(val));if(txt!==undefined)n.textContent=txt;return n;}
function render(){el('tabs').innerHTML='';for(const type of types){const b=document.createElement('button');b.textContent=type==='all'?'All nodes':type;b.className=type===filter?'active':'';b.addEventListener('click',()=>{filter=type;render()});el('tabs').append(b);}
const visible=report.nodes.filter(n=>filter==='all'||n.kind===filter).slice(0,90),map=el('map');map.replaceChildren();
if(!visible.length){map.append(svgNode('text',{x:40,y:190,fill:'#a0b4d0'},'No nodes of this type'));return;}
const positions=new Map();visible.forEach((n,i)=>{const angle=i*2.399963;const rad=22+Math.sqrt(i)*26;positions.set(n.id,{x:340+Math.cos(angle)*Math.min(rad,294),y:195+Math.sin(angle)*Math.min(rad,157)});});
for(const edge of report.edges){const a=positions.get(edge.from),b=positions.get(edge.to);if(a&&b)map.append(svgNode('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,stroke:'#38536a','stroke-width':1.2}));}
for(const n of visible){const p=positions.get(n.id),g=svgNode('g',{'class':'node','tabindex':0,'role':'button','aria-label':n.label});g.append(svgNode('circle',{cx:p.x,cy:p.y,r:9,fill:tones[n.kind]||'#fff',stroke:'#0d1929','stroke-width':3}));g.append(svgNode('text',{x:p.x+13,y:p.y+4,fill:'#d4e2f8','font-size':10},n.label.slice(0,23)));const pick=()=>{el('selection').textContent=n.kind.toUpperCase()+' · '+n.label+' — '+n.detail+(n.file?' ('+n.file+')':'')};g.addEventListener('click',pick);g.addEventListener('keydown',e=>{if(e.key==='Enter')pick()});map.append(g);}
}render();
</script></body></html>`;
}
