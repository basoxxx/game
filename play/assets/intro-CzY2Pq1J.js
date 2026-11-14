import{r as u,T as p,n as m,G as v,i as n,I as f,A as d,s as g,H as w,J as h}from"./index-Bf27NNCn.js";import{circuitPath as y}from"./trackview-CI08VaAV.js";import"./trackphys-DXvw_XA0.js";function T(){const a=new URLSearchParams(location.search);return a.has("intro")?!0:!(a.has("nointro")||navigator.webdriver)}let i=0,l=null,s=0;u({id:"intro",full:!0,render(){i=0;const a=p.formula,e=a[Math.floor(Math.random()*a.length)];let t="";try{t=m(y(e.cid),{w:900,h:620,glow:"#e5141b",color:"#fff",width:3,start:!1})}catch{}return`<div class="intro-screen" data-stage="0">
      <div class="intro-bg"><i></i><i></i><i></i><i></i><i></i><i></i></div>
      <div class="intro-track">${t}</div>
      <div class="intro-slab"></div>
      <div class="intro-center">
        <div class="intro-logo">${v(92)}<div class="intro-word"><span>Apex</span><span>Dynasty</span></div></div>
        <div class="intro-tag">Formula · Rally · Endurance · Scontro Totale</div>
        <div class="intro-press" data-a="intro-go" tabindex="0"><span class="ip-key">${n("play")}</span><span>Premi un tasto per iniziare</span></div>
      </div>
      <div class="intro-welcome" aria-live="polite"></div>
      <div class="intro-foot"><span>v6.0.0</span><span>Gioco di fantasia · nomi e marchi sono parodie e non affiliati</span><span class="intro-trk">${e.name}</span></div>
    </div>`},mount(){const a=t=>{i===0&&(t?.type==="keydown"&&(t.key==="F11"||t.key==="Tab"||t.ctrlKey||t.metaKey||t.altKey)||(t?.preventDefault?.(),c()))};l=a,window.addEventListener("keydown",a);const e=()=>{s=requestAnimationFrame(e);for(const t of navigator.getGamepads?.()||[])t?.buttons?.some(r=>r.pressed)&&i===0&&c()};s=requestAnimationFrame(e),document.querySelector(".intro-screen")?.addEventListener("pointerdown",t=>{t.target.closest(".intro-welcome")||a(t)}),requestAnimationFrame(()=>document.querySelector(".intro-press")?.focus({preventScroll:!0}))},unmount(){window.removeEventListener("keydown",l),cancelAnimationFrame(s)},actions:{"intro-go"(){i===0&&c()},"intro-career"(){o("newgame")},"intro-howto"(){o("howto",{back:"menu"})},"intro-menu"(){o("menu")}}});function o(a,e){try{localStorage.setItem(f,"1")}catch{}d.go(a,e)}function c(){i=1,g.sting();const a=document.querySelector(".intro-screen");if(!a)return;if(a.dataset.stage="1",!(!w()&&!h().some(r=>!r.empty))){setTimeout(()=>d.cur==="intro"&&o("menu"),650);return}const t=a.querySelector(".intro-welcome");t.innerHTML=`<div class="iw-k">Benvenuto, Team Principal</div>
    <h2>Da dove vuoi partire?</h2>
    <div class="iw-opts">
      <button class="iw-opt rec" data-a="intro-career">${n("flag")}<b>Inizia una carriera</b><span>Consigliato: una guida passo passo ti accompagna nella prima stagione.</span><em>Consigliato</em></button>
      <button class="iw-opt" data-a="intro-howto">${n("book")}<b>Come si gioca</b><span>Le basi del gestionale e della gara in pochi minuti.</span></button>
      <button class="iw-opt" data-a="intro-menu">${n("home")}<b>Menu principale</b><span>Gara rapida, Scontro Totale, sfide e impostazioni.</span></button>
    </div>`,setTimeout(()=>{a.dataset.stage="2",t.querySelector(".iw-opt")?.focus({preventScroll:!0})},700)}export{w as introSeen,T as shouldShowIntro};
