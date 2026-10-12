(function () {
  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function initials(name) {
    const words = String(name || "FP").trim().split(/\s+/).filter(Boolean);
    return words.slice(0, 2).map((word) => word[0]).join("").toUpperCase() || "FP";
  }

  // Mostra o logo da academia. Se nao houver logo (ou a imagem nao existir), aparecem as iniciais.
  function logoHtml(item, size) {
    const box = size || 48;
    const image = item && item.logo_url
      ? `<img src="${esc(item.logo_url)}" alt="Logo ${esc(item.name)}" onerror="this.remove()" style="position:absolute; inset:0; width:100%; height:100%; object-fit:contain; background:#FFFFFF; padding:3px; box-sizing:border-box;">`
      : "";
    return `<span style="position:relative; display:inline-flex; align-items:center; justify-content:center; flex:0 0 auto; width:${box}px; height:${box}px; border-radius:10px; border:1px solid #E2E8F0; background:#E0E7FF; color:#3B82F6; font-weight:700; font-size:${Math.round(box * 0.36)}px; overflow:hidden;">${esc(initials(item && item.name))}${image}</span>`;
  }

  window.FightPassLogo = { html: logoHtml };
})();