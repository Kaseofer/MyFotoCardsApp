/* Luli's Photocards · cuadros de diálogo
   Teclado en las ventanas: Escape cierra, Tab no se escapa de la ventana y al cerrar
   el foco vuelve al botón que la abrió. Cada ventana se registra en MODAL_CLOSE. */

/* ---------- teclado en los cuadros de diálogo ----------
   Al abrir uno, el foco entra; Tab no sale de él; Escape lo cierra; al cerrar, el foco vuelve a donde estaba. */
const MODAL_CLOSE = {projModal:"projClose", groupsModal:"groupsClose", ncModal:"ncCancel", keyModal:"keyClose", editor:"edCancel", artModal:"artCancel", pickModal:"pickCancel", coverModal:"coverCancel", nameModal:"nameCancel"};
const modalStack = [];
const focusables = el => [...el.querySelectorAll('button, [href], input, select, textarea, summary, [tabindex]:not([tabindex="-1"])')].filter(x => !x.disabled && x.getClientRects().length && (!x.checkVisibility || x.checkVisibility()));
document.querySelectorAll(".modal").forEach(m => {
  new MutationObserver(() => {
    const on = m.classList.contains("on"), at = modalStack.findIndex(x => x.m === m);
    if (on && at < 0){
      modalStack.push({m, from: document.activeElement});
      setTimeout(() => { if (!m.classList.contains("on") || m.contains(document.activeElement)) return; const f = m.id === "ncModal" ? $(ncFocus) : focusables(m)[0]; if (f){ f.focus(); if (f.select) f.select(); } else { m.querySelector(".mcard")?.setAttribute("tabindex", "-1"); m.querySelector(".mcard")?.focus(); } }, 30);
    } else if (!on && at >= 0){
      const [{from}] = modalStack.splice(at, 1);
      if (from && from.isConnected && from.focus && !modalStack.length) setTimeout(() => from.focus(), 0);
    }
  }).observe(m, {attributes:true, attributeFilter:["class"]});
});
document.addEventListener("keydown", e => {
  if (!$("cardMenu").hidden && e.key === "Escape"){ e.preventDefault(); closeCardMenu(true); return; }
  const top = modalStack[modalStack.length - 1]; if (!top) return;
  const m = top.m;
  if (e.key === "Escape" && MODAL_CLOSE[m.id]){ e.preventDefault(); $(MODAL_CLOSE[m.id]).click(); return; }
  if (e.key === "Tab"){
    const f = focusables(m); if (!f.length){ e.preventDefault(); return; }
    const i = f.indexOf(document.activeElement);
    if (e.shiftKey && (i <= 0)){ e.preventDefault(); f[f.length-1].focus(); }
    else if (!e.shiftKey && (i === -1 || i === f.length-1)){ e.preventDefault(); f[0].focus(); }
  }
});
