(function () {
  const api = window.FightPassApi;

  // Referencia usada na demonstracao quando o navegador nao libera a localizacao (Senac Nacoes Unidas).
  const DEMO_LOCATION = { lat: -23.6535, lng: -46.7075 };

  function $(selector) {
    return document.querySelector(selector);
  }

  function html(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function setMessage(message, type, details) {
    const element = $("#booking-message");
    if (!element) return;
    const detailText = Array.isArray(details)
      ? `<ul>${details.map((item) => `<li>${html(item.msg || item.message || JSON.stringify(item))}</li>`).join("")}</ul>`
      : "";
    element.className = `state-message ${type || "info"}`;
    element.innerHTML = message ? `${html(message)}${detailText}` : "";
    element.hidden = !message;
  }

  function nextDateForDay(dayOfWeek) {
    const date = new Date();
    const distance = (Number(dayOfWeek) - date.getDay() + 7) % 7;
    date.setDate(date.getDate() + distance);
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${date.getFullYear()}-${month}-${day}`;
  }

  function addDays(dateText, days) {
    const date = new Date(`${dateText}T00:00:00`);
    date.setDate(date.getDate() + days);
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${date.getFullYear()}-${month}-${day}`;
  }

  function distanceLabel(km) {
    if (km === null || km === undefined || Number.isNaN(Number(km))) return "Distancia indisponivel";
    const value = Number(km);
    if (value < 1) return `${Math.round(value * 1000)} m de voce`;
    return `${value.toFixed(1).replace(".", ",")} km de voce`;
  }

  async function init() {
    const user = await api.requireAuth(["student"]);
    if (!user) return;

    const params = new URLSearchParams(window.location.search);
    const requestedInstitutionId = params.get("institutionId");
    const requestedScheduleId = params.get("scheduleId");

    const institutionList = $("#institution-list");
    const locationStatus = $("#location-status");
    const locateButton = $("#use-location");
    const classesSection = $("#classes-section");
    const classesTitle = $("#classes-title");
    const classesList = $("#classes-list");
    const bookingSection = $("#booking-section");
    const selectedClass = $("#selected-class");
    const bookingDate = $("#booking-date");
    const recurring = $("#is-recurring");
    const endDate = $("#end-date");
    const bookingForm = $("#booking-form");

    let userLocation = null;
    let institutions = [];
    let selectedInstitution = null;
    let schedules = [];
    let selectedSchedule = null;

    function dateMatchesSchedule(value) {
      if (!selectedSchedule || !value) return true;
      return new Date(`${value}T00:00:00`).getDay() === Number(selectedSchedule.schedule.day_of_week);
    }

    function renderInstitutions() {
      if (!institutions.length) {
        institutionList.innerHTML = `<div class="empty-state">Nenhuma academia encontrada.</div>`;
        return;
      }
      institutionList.innerHTML = institutions.map((item) => `
        <button type="button" class="result-card ${selectedInstitution && String(selectedInstitution.id) === String(item.id) ? "selected" : ""}" style="margin-bottom:0;" data-institution-id="${item.id}">
          <div style="display:flex; gap:12px; align-items:center;">
            ${window.FightPassLogo ? window.FightPassLogo.html(item, 48) : ""}
            <div style="min-width:0;">
              <strong>${html(item.name)}</strong>
              <span>${html([item.neighborhood, item.city].filter(Boolean).join(" - ") || "Endereco nao informado")}</span>
              <small>${userLocation ? html(distanceLabel(item.distance_km)) : "Ative a localizacao para ver a distancia"}</small>
            </div>
          </div>
        </button>
      `).join("");
    }

    async function loadInstitutions() {
      setMessage("Carregando academias...", "loading");
      try {
        const query = new URLSearchParams();
        if (userLocation) {
          query.set("lat", userLocation.lat);
          query.set("lng", userLocation.lng);
        }
        const response = await api.request(`/map/search${query.toString() ? `?${query.toString()}` : ""}`);
        institutions = response.data || [];
        renderInstitutions();
        setMessage("", "info");
      } catch (error) {
        setMessage(error.message, "error", error.details);
      }
    }

    function useLocation(coordinates, label) {
      userLocation = coordinates;
      locationStatus.textContent = label;
      return loadInstitutions();
    }

    function askBrowserLocation() {
      if (!navigator.geolocation) {
        locationStatus.textContent = "Seu navegador nao disponibiliza localizacao.";
        return Promise.resolve();
      }
      locationStatus.textContent = "Obtendo sua localizacao...";
      return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            resolve(useLocation(
              { lat: position.coords.latitude, lng: position.coords.longitude },
              "Mostrando as academias mais proximas da sua localizacao atual."
            ));
          },
          () => {
            locationStatus.innerHTML = `Nao foi possivel obter sua localizacao. <a href="#" id="use-demo-location">Usar regiao do Senac Nacoes Unidas como referencia</a>`;
            resolve();
          },
          { enableHighAccuracy: true, timeout: 8000 }
        );
      });
    }

    function renderClasses() {
      classesSection.hidden = false;
      classesTitle.textContent = `2. Aulas - ${selectedInstitution.name}`;
      if (!schedules.length) {
        classesList.innerHTML = `<div class="empty-state">Esta academia ainda nao tem aulas ativas.</div>`;
        return;
      }
      const groups = new Map();
      schedules.forEach((item) => {
        if (!groups.has(item.modality_name)) groups.set(item.modality_name, []);
        groups.get(item.modality_name).push(item);
      });
      classesList.innerHTML = Array.from(groups.entries()).map(([modality, items]) => `
        <div style="margin-bottom: 20px;">
          <h3 style="font-size: 16px; margin-bottom: 10px; color: #1E293B;">${html(modality)}</h3>
          <div class="button-row" style="gap: 10px;">
            ${items.map((item) => `
              <button type="button" class="${selectedSchedule && selectedSchedule.schedule.id === item.schedule.id ? "btn-primary" : "btn-secondary"}" style="width:auto; padding:10px 16px; text-align:left;" data-schedule-id="${item.schedule.id}">
                ${html(api.dayLabel(item.schedule.day_of_week))} ${html(api.timeLabel(item.schedule.start_time))}-${html(api.timeLabel(item.schedule.end_time))}<br>
                <small>${html(item.title)}</small>
              </button>
            `).join("")}
          </div>
        </div>
      `).join("");
    }

    function selectSchedule(item) {
      selectedSchedule = item;
      renderClasses();
      bookingSection.hidden = false;
      selectedClass.textContent = `${selectedInstitution.name} - ${item.title} - ${item.modality_name} (${api.dayLabel(item.schedule.day_of_week)} ${api.timeLabel(item.schedule.start_time)})`;
      const nextDate = nextDateForDay(item.schedule.day_of_week);
      bookingDate.min = nextDate;
      bookingDate.step = 7;
      bookingDate.value = nextDate;
      endDate.min = nextDate;
      endDate.step = 7;
      endDate.value = addDays(nextDate, 28);
      setMessage(`Calendario limitado para ${api.dayLabel(item.schedule.day_of_week)}s, conforme a aula escolhida.`, "info");
      bookingSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    async function selectInstitution(institutionId, scheduleId) {
      const found = institutions.find((item) => String(item.id) === String(institutionId));
      if (!found) return;
      selectedInstitution = found;
      selectedSchedule = null;
      bookingSection.hidden = true;
      renderInstitutions();
      classesSection.hidden = false;
      classesTitle.textContent = `2. Aulas - ${found.name}`;
      classesList.innerHTML = `<div class="empty-state">Carregando aulas...</div>`;
      try {
        const response = await api.request(`/classes?institutionId=${encodeURIComponent(found.id)}`);
        schedules = response.data.flatMap((classItem) => (classItem.schedules || []).map((schedule) => ({
          ...classItem,
          schedule
        })));
        renderClasses();
        setMessage("", "info");
        const preselected = scheduleId ? schedules.find((item) => String(item.schedule.id) === String(scheduleId)) : null;
        if (preselected) {
          selectSchedule(preselected);
        } else {
          classesSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      } catch (error) {
        classesList.innerHTML = "";
        setMessage(error.message, "error", error.details);
      }
    }

    institutionList.addEventListener("click", (event) => {
      const button = event.target.closest("[data-institution-id]");
      if (!button) return;
      selectInstitution(button.dataset.institutionId);
    });

    classesList.addEventListener("click", (event) => {
      const button = event.target.closest("[data-schedule-id]");
      if (!button) return;
      const item = schedules.find((entry) => String(entry.schedule.id) === button.dataset.scheduleId);
      if (item) selectSchedule(item);
    });

    locateButton.addEventListener("click", askBrowserLocation);

    locationStatus.addEventListener("click", (event) => {
      if (event.target.id !== "use-demo-location") return;
      event.preventDefault();
      useLocation(DEMO_LOCATION, "Usando a regiao do Senac Nacoes Unidas como referencia.");
    });

    bookingDate.addEventListener("change", () => {
      if (!dateMatchesSchedule(bookingDate.value) && selectedSchedule) {
        selectSchedule(selectedSchedule);
      }
    });

    recurring.addEventListener("change", () => {
      $("#recurring-fields").hidden = !recurring.checked;
    });

    bookingForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!selectedSchedule) {
        setMessage("Escolha uma aula antes de confirmar.", "error");
        return;
      }
      if (!dateMatchesSchedule(bookingDate.value)) {
        setMessage("Escolha uma data compativel com o dia da semana da aula selecionada.", "error");
        return;
      }
      if (recurring.checked && !dateMatchesSchedule(endDate.value)) {
        setMessage("A data final da recorrencia deve cair no mesmo dia da semana da aula.", "error");
        return;
      }
      setMessage("Enviando agendamento...", "loading");
      const payload = { classScheduleId: Number(selectedSchedule.schedule.id) };
      try {
        const response = recurring.checked
          ? await api.request("/bookings/recurring", {
            method: "POST",
            body: { ...payload, startDate: bookingDate.value, endDate: endDate.value }
          })
          : await api.request("/bookings", {
            method: "POST",
            body: { ...payload, bookingDate: bookingDate.value }
          });
        const total = Array.isArray(response.data) ? response.data.length : 1;
        setMessage(`${response.message} (${total} aula${total > 1 ? "s" : ""}).`, "success");
      } catch (error) {
        setMessage(error.message, "error", error.details);
      }
    });

    // Primeiro carrega a lista (sem distancia) e depois tenta usar a localizacao do aluno.
    await loadInstitutions();
    if (requestedInstitutionId) {
      await selectInstitution(requestedInstitutionId, requestedScheduleId);
    }
    await askBrowserLocation();
  }

  document.addEventListener("DOMContentLoaded", init);
})();