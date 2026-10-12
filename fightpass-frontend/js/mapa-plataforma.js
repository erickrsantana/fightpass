(function () {
  const api = window.FightPassApi;

  function $(selector) {
    return document.querySelector(selector);
  }

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function peopleLabel(count) {
    return `${count} ${count === 1 ? "pessoa" : "pessoas"}`;
  }

  function hasCoordinates(item) {
    return item.latitude !== null && item.latitude !== undefined && item.longitude !== null && item.longitude !== undefined;
  }

  async function init() {
    const user = await api.requireAuth(["platform_admin"]);
    if (!user) return;

    const message = $("#map-message");
    const list = $("#institution-list");

    const map = L.map("map-view").setView([-23.6535, -46.7075], 12);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap"
    }).addTo(map);

    let institutions = [];
    const markers = new Map();

    try {
      const response = await api.request("/platform/institutions");
      institutions = response.data || [];
    } catch (error) {
      message.className = "state-message error";
      message.textContent = error.message;
      message.hidden = false;
      return;
    }

    if (!institutions.length) {
      list.innerHTML = `<div class="empty-state">Nenhuma academia ativa.</div>`;
      return;
    }

    const bounds = [];
    institutions.forEach((item) => {
      if (!hasCoordinates(item)) return;
      const position = [Number(item.latitude), Number(item.longitude)];
      bounds.push(position);
      const marker = L.marker(position).addTo(map);
      marker.bindTooltip(
        `<strong>${esc(item.name)}</strong><br>${esc(peopleLabel(item.students_count))}`,
        { sticky: true, direction: "top" }
      );
      markers.set(String(item.id), marker);
    });
    if (bounds.length) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });

    list.innerHTML = institutions.map((item) => `
      <button type="button" class="result-card" data-id="${item.id}">
        <div style="display:flex; gap:12px; align-items:center;">
          ${window.FightPassLogo ? window.FightPassLogo.html(item, 48) : ""}
          <div style="min-width:0;">
            <strong>${esc(item.name)}</strong>
            <span>${esc([item.neighborhood, item.city].filter(Boolean).join(" - "))}</span>
            <small>${esc(peopleLabel(item.students_count))} &middot; ${esc(item.staff_count)} na equipe</small>
          </div>
        </div>
      </button>
    `).join("");

    list.addEventListener("click", (event) => {
      const button = event.target.closest("[data-id]");
      if (!button) return;
      const marker = markers.get(button.dataset.id);
      if (marker) {
        map.setView(marker.getLatLng(), 15);
        marker.openTooltip();
      }
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();