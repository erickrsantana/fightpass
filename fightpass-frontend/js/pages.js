(function () {
  const api = window.FightPassApi;

  function $(selector) {
    return document.querySelector(selector);
  }

  function $all(selector) {
    return Array.from(document.querySelectorAll(selector));
  }

  function html(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function setMessage(target, message, type = "info", details = null) {
    const element = typeof target === "string" ? $(target) : target;
    if (!element) return;
    const detailText = Array.isArray(details)
      ? `<ul>${details.map((item) => `<li>${html(item.msg || item.message || JSON.stringify(item))}</li>`).join("")}</ul>`
      : "";
    element.className = `state-message ${type}`;
    element.innerHTML = message ? `${html(message)}${detailText}` : "";
    element.hidden = !message;
  }

  function setText(selector, value) {
    const element = $(selector);
    if (element) element.textContent = value;
  }

  function formData(form) {
    return Object.fromEntries(new FormData(form).entries());
  }

  function clearFieldErrors(form) {
    if (!form) return;
    form.querySelectorAll(".input-error").forEach((item) => item.classList.remove("input-error"));
    form.querySelectorAll("[data-field-error]").forEach((item) => item.remove());
  }

  function applyFieldErrors(form, details) {
    clearFieldErrors(form);
    if (!form || !Array.isArray(details)) return;

    details.forEach((detail) => {
      const fieldName = detail.path || detail.param;
      if (!fieldName) return;
      const field = Array.from(form.elements).find((element) => element.name === fieldName);
      if (!field) return;
      field.classList.add("input-error");
      const message = document.createElement("small");
      message.dataset.fieldError = fieldName;
      message.className = "field-error";
      message.textContent = detail.msg || detail.message || "Verifique este campo.";
      field.insertAdjacentElement("afterend", message);
    });
  }

  function setupPasswordToggle(inputSelector, toggleSelector) {
    const input = $(inputSelector);
    const toggle = $(toggleSelector);
    if (!input || !toggle) return;
    toggle.addEventListener("change", () => {
      input.type = toggle.checked ? "text" : "password";
    });
  }

  function daysUntil(value) {
    if (!value) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(value);
    if (Number.isNaN(target.getTime())) return null;
    target.setHours(0, 0, 0, 0);
    return Math.ceil((target.getTime() - today.getTime()) / 86400000);
  }

  function isTomorrow(value) {
    return daysUntil(value) === 1;
  }

  function initials(value) {
    return String(value || "FP")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0] || "")
      .join("")
      .toUpperCase();
  }

  function formatCurrency(cents) {
    return (Number(cents || 0) / 100).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL"
    });
  }

  function nextDateForDay(dayOfWeek) {
    const date = new Date();
    const target = Number(dayOfWeek);
    const distance = (target - date.getDay() + 7) % 7;
    date.setDate(date.getDate() + distance);
    return date.toISOString().slice(0, 10);
  }

  function renderFlash() {
    const flash = api.consumeFlash();
    if (flash) setMessage("[data-flash]", flash.message, flash.type);
  }

  function currentInstitutionOrStop(user, messageTarget) {
    const institutionId = api.firstInstitutionId(user);
    if (!institutionId) {
      setMessage(messageTarget, "Este usuário não está vinculado a uma instituiçao ativa.", "error");
      return null;
    }
    return institutionId;
  }

  async function initLogin() {
    api.redirectIfAuthenticated();
    renderFlash();
    const form = $("#login-form");
    setupPasswordToggle("#login-password", "#show-login-password");
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      clearFieldErrors(form);
      setMessage("#login-message", "Autenticando...", "loading");
      const data = formData(form);
      try {
        const response = await api.login(data.email, data.password);
        api.saveSession(response.data);
        if (response.data.user.role === "institution_admin") {
          window.location.href = "planos.html";
        } else {
          api.redirectByRole(response.data.user);
        }
      } catch (error) {
        applyFieldErrors(form, error.details);
        setMessage("#login-message", error.message, "error", error.details);
      }
    });
  }

  async function initCadastro() {
    api.redirectIfAuthenticated();
    const form = $("#register-form");
    const accountType = $("#account-type");
    const institutionGroup = $("#institution-group");
    const termsAcceptance = window.FightPassTerms.createAcceptance("#register-terms", {
      origin: "cadastro"
    });

    function syncInstitutionField() {
      if (!institutionGroup || !accountType) return;
      institutionGroup.hidden = accountType.value !== "institution_admin";
    }

    if (accountType) accountType.addEventListener("change", syncInstitutionField);
    syncInstitutionField();
    setupPasswordToggle("#register-password", "#show-register-password");
    await termsAcceptance.load();

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      clearFieldErrors(form);
      if (!termsAcceptance.isAccepted()) {
        setMessage("#register-message", "Aceite os Termos de Uso para finalizar o cadastro.", "error");
        return;
      }

      setMessage("#register-message", "Criando conta...", "loading");
      const data = formData(form);
      try {
        const response = await api.register({
          name: data.name,
          email: data.email,
          password: data.password,
          accountType: data.accountType || "student",
          gender: data.gender || null,
          document: data.document,
          phone: data.phone || null,
          institutionName: data.institutionName || data.name,
          ...termsAcceptance.payload()
        });
        api.saveSession(response.data);
        api.setFlash(
          response.data.user.role === "institution_admin"
            ? "Conta criada. Assine o Plano DOJO para disponibilizar aulas."
            : response.data.access ? "Conta criada com teste gratuito de 1 dia." : "Conta criada com sucesso.",
          "success"
        );
        api.redirectByRole(response.data.user);
      } catch (error) {
        applyFieldErrors(form, error.details);
        setMessage("#register-message", error.message, "error", error.details);
      }
    });
  }

  async function initRecuperacaoSenha() {
    api.redirectIfAuthenticated();
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    const emailForm = $("#forgot-form");
    const resetForm = $("#reset-form");

    emailForm.hidden = Boolean(token);
    resetForm.hidden = !token;

    emailForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      setMessage("#recovery-message", "Enviando solicitação..", "loading");
      try {
        const data = formData(emailForm);
        const response = await api.forgotPassword(data.email);
        api.setFlash(response.message, "success");
        window.location.href = "sucesso-email.html";
      } catch (error) {
        setMessage("#recovery-message", error.message, "error", error.details);
      }
    });

    resetForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = formData(resetForm);
      if (data.password !== data.confirmPassword) {
        setMessage("#recovery-message", "A confirmação deve ser igual a nova senha.", "error");
        return;
      }
      setMessage("#recovery-message", "Redefinindo senha...", "loading");
      try {
        await api.resetPassword(token, data.password);
        api.setFlash("Senha redefinida com sucesso, faça login novamente", "success");
        window.location.href = "login.html";
      } catch (error) {
        setMessage("#recovery-message", error.message, "error", error.details);
      }
    });
  }

  async function initDashboard() {
    const user = await api.requireAuth();
    if (!user) return;
    renderFlash();
    setMessage("#dashboard-message", "Carregando indicadores...", "loading");
    try {
      if (user.role === "student") {
        const [response, accessResponse, bookingsResponse] = await Promise.all([
          api.request("/dashboard/student"),
          api.request("/access/me"),
          api.request("/bookings")
        ]);
        setText("#metric-one-label", "Aulas agendadas");
        setText("#metric-one-value", response.data.weekly_classes ?? 0);
        setText("#metric-two-label", "Presença");
        setText("#metric-two-value", `${response.data.attendance_rate ?? 0}%`);
        setText("#metric-three-label", "Avaliação");
        setText("#metric-three-value", response.data.average_score ?? 0);
        renderAccessSummary(accessResponse.data);
        renderStudentNotifications(bookingsResponse.data, accessResponse.data);
      } else {
        const institutionId = currentInstitutionOrStop(user, "#dashboard-message");
        if (!institutionId) return;
        const response = await api.request(`/dashboard/institution/${institutionId}`);
        setText("#metric-one-label", "Alunos ativos");
        setText("#metric-one-value", response.data.active_students ?? 0);
        setText("#metric-two-label", "Presença média");
        setText("#metric-two-value", `${response.data.attendance_rate ?? 0}%`);
        setText("#metric-three-label", "Risco de evasão");
        setText("#metric-three-value", `${response.data.dropout_risk_rate ?? 0}%`);
      }
      setMessage("#dashboard-message", "", "info");
    } catch (error) {
      setMessage("#dashboard-message", error.message, "error", error.details);
    }
  }

  function renderAccessSummary(accessData) {
    const panel = $("#access-summary");
    if (!panel) return;

    panel.hidden = false;
    if (!accessData || !accessData.hasActiveAccess) {
      panel.innerHTML = `
        <h2 style="font-size: 18px; margin-bottom: 8px;">Acesso FightPass</h2>
        <p style="color:#991B1B;">Seu teste terminou ou você ainda não possui plano ativo.</p>
        <a class="btn-primary" style="display:inline-block; width:auto; margin-top:14px; padding:10px 18px;" href="planos.html">Contratar plano</a>
      `;
      return;
    }

    const access = accessData.access;
    const remaining = access.sessions_total === null
      ? "Ilimitado"
      : `${Math.max(0, access.sessions_total - access.sessions_used)} treino(s)`;
    const remainingDays = daysUntil(access.expires_at);
    const expirationWarning = remainingDays !== null && remainingDays <= 3
      ? `<div class="notice-card warning">Seu plano vence ${remainingDays <= 0 ? "hoje" : `em ${remainingDays} dia(s)`}. Renove ou troque de plano em Planos.</div>`
      : "";
    panel.innerHTML = `
      <h2 style="font-size: 18px; margin-bottom: 8px;">Acesso FightPass</h2>
      <p><strong>${html(access.plan_name)}</strong></p>
      <p style="color:#64748B;">Validade: ${api.formatDate(access.expires_at)} | Treinos restantes: ${remaining}</p>
      ${expirationWarning}
      <a class="btn-secondary" style="display:inline-block; width:auto; margin-top:14px; padding:10px 18px;" href="planos.html">Ver planos</a>
    `;
  }

  function renderStudentNotifications(bookings, accessData) {
    const panel = $("#student-notifications");
    if (!panel) return;

    const notices = [];
    const tomorrowClasses = (bookings || []).filter((item) => item.status !== "cancelled" && isTomorrow(item.booking_date));
    tomorrowClasses.forEach((item) => {
      notices.push(`Amanha tem ${item.modality_name} em ${item.institution_name} as ${api.timeLabel(item.start_time)}.`);
    });

    if (accessData && accessData.hasActiveAccess) {
      const remaining = daysUntil(accessData.access.expires_at);
      if (remaining !== null && remaining <= 3) {
        notices.push(`Seu plano ${accessData.access.plan_name} vence ${remaining <= 0 ? "hoje" : `em ${remaining} dia(s)`}.`);
      }
    }

    panel.hidden = false;
    panel.innerHTML = notices.length
      ? `<h2 style="font-size:18px; margin-bottom:10px;">Notificacoes</h2>${notices.map((notice) => `<div class="notice-card">${html(notice)}</div>`).join("")}`
      : `<h2 style="font-size:18px; margin-bottom:10px;">Notificacoes</h2><div class="empty-state">Nenhum aviso importante para hoje.</div>`;
  }

  async function initMapa() {
    const user = await api.requireAuth();
    if (!user) return;
    let selectedModalities = [];
    let institutions = [];
    let userCoordinates = null;
    const searchInput = $("#map-search");
    const nearInput = $("#near-address");
    const locateButton = $("#use-location");
    const modalityList = $("#modality-list");
    const institutionList = $("#institution-list");
    const details = $("#institution-details");
    const mapElement = $("#map-view");
    let map = null;
    let markerLayer = null;
    let searchTimer = null;

    function numericCoordinate(value) {
      const coordinate = Number(value);
      return Number.isFinite(coordinate) ? coordinate : null;
    }

    function hasCoordinates(item) {
      return numericCoordinate(item.latitude) !== null && numericCoordinate(item.longitude) !== null;
    }

    function syncSelectedModalities() {
      selectedModalities = $all("[data-modality-filter]:checked").map((item) => item.value);
    }

    function scheduleLink(item, scheduleId) {
      const params = new URLSearchParams({
        institutionId: item.id,
        scheduleId
      });
      return `agendar.html?${params.toString()}`;
    }

    function debouncedLoadInstitutions() {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(loadInstitutions, 250);
    }

    function initMap() {
      if (!mapElement) return;
      if (!window.L) {
        mapElement.innerHTML = `<div class="empty-state">Mapa indisponível. Verifique a conexão com a biblioteca de mapas.</div>`;
        return;
      }

      map = L.map(mapElement).setView([-23.55052, -46.633308], 12);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap"
      }).addTo(map);
      markerLayer = L.layerGroup().addTo(map);
    }

    async function loadInstitutionDetails(institutionId) {
      setMessage("#map-message", "Carregando detalhes...", "loading");
      try {
        const response = await api.request(`/institutions/${institutionId}`);
        const item = response.data;
        const address = item.formatted_address
          || [item.street, item.number, item.neighborhood, item.city, item.state, item.zip_code].filter(Boolean).join(", ");
        const classes = item.classes || [];
        details.innerHTML = `
          <h2>${html(item.name)}</h2>
          <p>${html(item.description || "Sem descrição cadastrada.")}</p>
          <p><strong>Contato:</strong> ${html(item.email || "-")} ${html(item.phone || "")}</p>
          <p><strong>Endereço:</strong> ${html(address || "Endereço não cadastrado.")}</p>
          <p><strong>Localização:</strong> ${hasCoordinates(item) ? `${html(item.latitude)}, ${html(item.longitude)}` : "Coordenadas pendentes para este CEP."}</p>
          ${item.modalities && item.modalities.length ? `<div class="chip-row">${item.modalities.map((modality) => `<span class="badge-modalidade">${html(modality.name)}</span>`).join("")}</div>` : ""}
          <h3>Turmas vinculadas</h3>
          ${classes.length ? `<ul class="simple-list">${classes.map((classItem) => `
            <li>
              <strong>${html(classItem.title)}</strong> - ${html(classItem.modality_name)}
              (${api.dayLabel(classItem.day_of_week)} ${api.timeLabel(classItem.start_time)})
              <a href="${scheduleLink(item, classItem.schedule_id)}">Reservar</a>
            </li>
          `).join("")}</ul>` : `<div class="empty-state">Nenhuma turma ativa vinculada.</div>`}
          <div class="button-row" style="margin-top:18px;">
            <a class="btn-primary" style="width:auto; padding:10px 18px;" href="agendar.html?institutionId=${html(item.id)}">Ver agenda</a>
            <a class="btn-secondary" style="width:auto; padding:10px 18px;" href="checkin.html">Fazer check-in</a>
          </div>
        `;

        $all(".result-card").forEach((card) => {
          card.classList.toggle("selected", card.dataset.id === String(institutionId));
        });

        if (map && hasCoordinates(item)) {
          map.setView([numericCoordinate(item.latitude), numericCoordinate(item.longitude)], 16);
        }

        setMessage("#map-message", "", "info");
      } catch (error) {
        setMessage("#map-message", error.message, "error", error.details);
      }
    }

    function renderMarkers() {
      if (!map || !markerLayer) return;
      markerLayer.clearLayers();
      const bounds = [];

      institutions.filter(hasCoordinates).forEach((item) => {
        const lat = numericCoordinate(item.latitude);
        const lng = numericCoordinate(item.longitude);
        bounds.push([lat, lng]);
        L.marker([lat, lng])
          .addTo(markerLayer)
          .bindPopup(`<strong>${html(item.name)}</strong><br>${html(item.formatted_address || [item.street, item.number, item.city, item.state].filter(Boolean).join(", "))}`)
          .on("click", () => loadInstitutionDetails(item.id));
      });

      if (bounds.length) {
        map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
      }
    }

    async function loadInstitutions() {
      setMessage("#map-message", "Carregando academias...", "loading");
      const params = new URLSearchParams();
      if (selectedModalities.length) params.set("modalities", selectedModalities.join(","));
      if (searchInput.value) params.set("search", searchInput.value);
      if (nearInput && nearInput.value) params.set("near", nearInput.value);
      if (userCoordinates) {
        params.set("lat", userCoordinates.lat);
        params.set("lng", userCoordinates.lng);
      }
      try {
        const response = await api.request(`/map/search?${params.toString()}`);
        institutions = response.data;
        if (!institutions.length) {
          institutionList.innerHTML = `<div class="empty-state">Nenhuma instituição encontrada para os filtros informados.</div>`;
        } else {
          institutionList.innerHTML = institutions.map((item) => `
            <button class="result-card" data-id="${item.id}">
              <strong>${html(item.name)}</strong>
              <span>${html([item.neighborhood, item.city, item.state].filter(Boolean).join(" - "))}</span>
              <small>${item.distance_km !== null && item.distance_km !== undefined ? `${html(item.distance_km)} km de voce` : hasCoordinates(item) ? "Localizacao disponivel no mapa" : "Coordenadas pendentes para este CEP"}</small>
            </button>
          `).join("");
        }
        renderMarkers();
        setMessage("#map-message", "", "info");
      } catch (error) {
        setMessage("#map-message", error.message, "error", error.details);
      }
    }

    modalityList.addEventListener("change", (event) => {
      if (!event.target.matches("[data-modality-filter]")) return;
      syncSelectedModalities();
      loadInstitutions();
    });

    modalityList.addEventListener("click", (event) => {
      const clearButton = event.target.closest("[data-clear-modalities]");
      if (!clearButton) return;
      $all("[data-modality-filter]").forEach((item) => {
        item.checked = false;
      });
      syncSelectedModalities();
      loadInstitutions();
    });

    institutionList.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-id]");
      if (!button) return;
      await loadInstitutionDetails(button.dataset.id);
    });

    searchInput.addEventListener("input", debouncedLoadInstitutions);
    if (nearInput) nearInput.addEventListener("input", debouncedLoadInstitutions);
    if (locateButton) {
      locateButton.addEventListener("click", () => {
        if (!navigator.geolocation) {
          setMessage("#map-message", "Seu navegador nao disponibilizou localizacao.", "error");
          return;
        }

        setMessage("#map-message", "Obtendo sua localizacao...", "loading");
        navigator.geolocation.getCurrentPosition(
          (position) => {
            userCoordinates = {
              lat: position.coords.latitude,
              lng: position.coords.longitude
            };
            loadInstitutions();
          },
          () => setMessage("#map-message", "Nao foi possivel obter sua localizacao. Digite um bairro ou endereco.", "error"),
          { enableHighAccuracy: true, timeout: 8000 }
        );
      });
    }

    try {
      initMap();
      const response = await api.request("/modalities");
      modalityList.innerHTML = `
        ${response.data.map((item) => `
          <label class="filter-check">
            <input type="checkbox" value="${html(item.slug)}" data-modality-filter>
            <span>${html(item.name)}</span>
          </label>
        `).join("")}
        <button class="filter-button" type="button" data-clear-modalities>Limpar filtros</button>
      `;
      await loadInstitutions();
    } catch (error) {
      setMessage("#map-message", error.message, "error", error.details);
    }
  }

  async function initAgendar() {
    const user = await api.requireAuth(["student"]);
    if (!user) return;
    const scheduleSelect = $("#class-schedule-id");
    const bookingDate = $("#booking-date");
    const recurring = $("#is-recurring");
    const endDate = $("#end-date");
    const preview = $("#schedule-preview");
    const params = new URLSearchParams(window.location.search);
    const requestedInstitutionId = params.get("institutionId");
    const requestedScheduleId = params.get("scheduleId");
    let schedules = [];

    function dateMatchesSelectedSchedule(value) {
      const selected = schedules.find((item) => String(item.schedule.id) === scheduleSelect.value);
      if (!selected || !value) return true;
      return new Date(`${value}T00:00:00`).getDay() === Number(selected.schedule.day_of_week);
    }

    function syncSelectedSchedule() {
      const selected = schedules.find((item) => String(item.schedule.id) === scheduleSelect.value);
      if (!selected) return;
      const nextAvailableDate = nextDateForDay(selected.schedule.day_of_week);
      bookingDate.min = nextAvailableDate;
      bookingDate.step = 7;
      bookingDate.value = nextAvailableDate;
      const end = new Date(`${bookingDate.value}T00:00:00`);
      end.setDate(end.getDate() + 28);
      endDate.min = bookingDate.value;
      endDate.step = 7;
      endDate.value = end.toISOString().slice(0, 10);
      setMessage("#booking-message", `Calendário limitado para ${api.dayLabel(selected.schedule.day_of_week)}s, conforme a turma selecionada.`, "info");
    }

    function renderPreview() {
      preview.innerHTML = schedules.length ? schedules.map((item) => `
        <tr>
          <td>${api.dayLabel(item.schedule.day_of_week)}</td>
          <td>${api.timeLabel(item.schedule.start_time)}</td>
          <td>${html(item.modality_name)}</td>
          <td>${html(item.institution_name)}</td>
        </tr>
      `).join("") : `<tr><td colspan="4">Nenhuma turma ativa encontrada.</td></tr>`;
    }

    setMessage("#booking-message", "Carregando turmas...", "loading");
    try {
      const classParams = new URLSearchParams();
      if (requestedInstitutionId) classParams.set("institutionId", requestedInstitutionId);
      const response = await api.request(`/classes${classParams.toString() ? `?${classParams.toString()}` : ""}`);
      schedules = response.data.flatMap((classItem) => (classItem.schedules || []).map((schedule) => ({
        ...classItem,
        schedule
      })));
      if (!schedules.length) {
        scheduleSelect.innerHTML = "";
        renderPreview();
        setMessage("#booking-message", "Nenhuma aula ativa disponível para agendamento.", "error");
        return;
      }
      scheduleSelect.innerHTML = schedules.map((item) => `
        <option value="${item.schedule.id}" ${String(item.schedule.id) === requestedScheduleId ? "selected" : ""}>
          ${html(item.institution_name)} - ${html(item.title)} - ${html(item.modality_name)} (${api.dayLabel(item.schedule.day_of_week)} ${api.timeLabel(item.schedule.start_time)})
        </option>
      `).join("");
      if (requestedScheduleId && !schedules.some((item) => String(item.schedule.id) === requestedScheduleId)) {
        scheduleSelect.selectedIndex = 0;
      }
      renderPreview();
      syncSelectedSchedule();
      setMessage("#booking-message", "", "info");
    } catch (error) {
      setMessage("#booking-message", error.message, "error", error.details);
    }

    scheduleSelect.addEventListener("change", syncSelectedSchedule);
    bookingDate.addEventListener("change", () => {
      if (!dateMatchesSelectedSchedule(bookingDate.value)) {
        syncSelectedSchedule();
      }
    });
    recurring.addEventListener("change", () => {
      $("#recurring-fields").hidden = !recurring.checked;
    });

    $("#booking-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      setMessage("#booking-message", "Enviando agendamento...", "loading");
      if (!dateMatchesSelectedSchedule(bookingDate.value)) {
        setMessage("#booking-message", "Escolha uma data compatível com o dia da semana da turma selecionada.", "error");
        return;
      }
      if (recurring.checked && !dateMatchesSelectedSchedule(endDate.value)) {
        setMessage("#booking-message", "A data final da recorrência deve cair no mesmo dia da semana da turma.", "error");
        return;
      }
      const payload = {
        classScheduleId: Number(scheduleSelect.value)
      };
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
        setMessage("#booking-message", `${response.message} (${total} aula${total > 1 ? "s" : ""}).`, "success");
      } catch (error) {
        setMessage("#booking-message", error.message, "error", error.details);
      }
    });
  }

  async function initMinhasAulas() {
    const user = await api.requireAuth(["student"]);
    if (!user) return;
    const tbody = $("#bookings-table");

    async function loadBookings() {
      setMessage("#my-classes-message", "Carregando aulas...", "loading");
      try {
        const response = await api.request("/bookings");
        const reminders = $("#class-reminders");
        if (reminders) {
          const tomorrowClasses = response.data.filter((item) => item.status !== "cancelled" && isTomorrow(item.booking_date));
          reminders.hidden = false;
          reminders.innerHTML = tomorrowClasses.length
            ? tomorrowClasses.map((item) => `<div class="notice-card">Lembrete: amanha voce tem ${html(item.modality_name)} em ${html(item.institution_name)} as ${api.timeLabel(item.start_time)}.</div>`).join("")
            : `<div class="empty-state">Nenhuma aula marcada para amanha.</div>`;
        }
        tbody.innerHTML = response.data.length ? response.data.map((item) => `
          <tr>
            <td>${api.formatDate(item.booking_date)}</td>
            <td>${api.dayLabel(item.day_of_week)}</td>
            <td>${api.timeLabel(item.start_time)}</td>
            <td><span class="badge-modalidade">${html(item.modality_name)}</span></td>
            <td>${html(api.statusLabel(item.status))}</td>
            <td>
              <button class="btn-cancel" data-cancel="${item.id}" ${item.status === "cancelled" ? "disabled" : ""}>Cancelar</button>
            </td>
          </tr>
        `).join("") : `<tr><td colspan="6">Nenhuma aula encontrada.</td></tr>`;
        setMessage("#my-classes-message", "", "info");
      } catch (error) {
        setMessage("#my-classes-message", error.message, "error", error.details);
      }
    }

    tbody.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-cancel]");
      if (!button) return;
      setMessage("#my-classes-message", "Cancelando aula...", "loading");
      try {
        const response = await api.request(`/bookings/${button.dataset.cancel}`, { method: "DELETE" });
        setMessage("#my-classes-message", response.message, "success");
        await loadBookings();
      } catch (error) {
        setMessage("#my-classes-message", error.message, "error", error.details);
      }
    });

    await loadBookings();
  }

  async function initCheckin() {
    const user = await api.requireAuth(["student"]);
    if (!user) return;
    let countdownTimer = null;
    let currentToken = null;

    function startCountdown(expiresAt) {
      clearInterval(countdownTimer);
      const display = $("#countdown");
      countdownTimer = setInterval(() => {
        const remaining = Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000));
        display.textContent = `00:${String(remaining).padStart(2, "0")}`;
        if (remaining <= 0) {
          clearInterval(countdownTimer);
          setMessage("#checkin-message", "Token expirado. Gere um novo código.", "error");
        }
      }, 500);
    }

    $("#generate-token").addEventListener("click", async () => {
      setMessage("#checkin-message", "Gerando token...", "loading");
      try {
        const response = await api.request("/checkin/token", { method: "POST", body: {} });
        currentToken = response.data.token;
        $("#token-value").textContent = currentToken;
        $("#qr-code").src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(currentToken)}`;
        $("#qr-area").hidden = false;
        startCountdown(response.data.expiresAt);
        setMessage("#checkin-message", response.message, "success");
      } catch (error) {
        setMessage("#checkin-message", error.message, "error", error.details);
      }
    });

    $("#confirm-token").addEventListener("click", async () => {
      if (!currentToken) {
        setMessage("#checkin-message", "Gere um token antes de confirmar o check-in.", "error");
        return;
      }
      setMessage("#checkin-message", "Confirmando presença...", "loading");
      try {
        const response = await api.request("/checkin/confirm", { method: "POST", body: { token: currentToken } });
        clearInterval(countdownTimer);
        setMessage("#checkin-message", response.message, "success");
      } catch (error) {
        setMessage("#checkin-message", error.message, "error", error.details);
      }
    });
  }

  async function initPerfil() {
    const user = await api.requireAuth();
    if (!user) return;
    setupPasswordToggle("#current-password", "#show-current-password");
    setupPasswordToggle("#profile-new-password", "#show-new-password");
    setupPasswordToggle("#profile-confirm-password", "#show-confirm-password");

    function renderProfilePhoto(profile) {
      const preview = $("#profile-photo-preview");
      if (!preview) return;
      const avatarUrl = profile.avatar_url || profile.avatarUrl;
      preview.innerHTML = avatarUrl
        ? `<img src="${html(avatarUrl)}" alt="Foto de ${html(profile.name)}">`
        : `<span>${html(initials(profile.name))}</span>`;
    }

    function renderProfileAccess(accessData) {
      const panel = $("#profile-access");
      if (!panel) return;
      if (user.role !== "student") {
        panel.hidden = true;
        return;
      }
      panel.hidden = false;

      if (!accessData || !accessData.hasActiveAccess) {
        panel.innerHTML = `
          <h2 style="font-size: 20px; margin-bottom: 12px;">Plano do aluno</h2>
          <p style="color:#991B1B;">Sem plano ativo no momento.</p>
          <a class="btn-primary" style="display:inline-block; width:auto; margin-top:14px; padding:10px 18px;" href="planos.html">Ver planos</a>
        `;
        return;
      }

      const access = accessData.access;
      const remaining = access.sessions_total === null
        ? "Ilimitado"
        : `${Math.max(0, access.sessions_total - access.sessions_used)} treino(s)`;
      const remainingDays = daysUntil(access.expires_at);
      panel.innerHTML = `
        <h2 style="font-size: 20px; margin-bottom: 12px;">Plano do aluno</h2>
        <p><strong>${html(access.plan_name)}</strong></p>
        <p style="color:#64748B;">Valido ate ${api.formatDate(access.expires_at)} | Treinos restantes: ${remaining}</p>
        ${remainingDays !== null && remainingDays <= 3 ? `<div class="notice-card warning">Seu plano vence ${remainingDays <= 0 ? "hoje" : `em ${remainingDays} dia(s)`}.</div>` : ""}
        <div class="button-row" style="margin-top:14px;">
          <a class="btn-secondary" style="width:auto; padding:10px 18px;" href="planos.html">Trocar plano</a>
          <button class="btn-cancel" type="button" data-cancel-access="${access.id}">Cancelar plano</button>
        </div>
      `;
    }

    async function loadProfile() {
      setMessage("#profile-message", "Carregando perfil...", "loading");
      try {
        const [response, accessResponse] = await Promise.all([
          api.request("/profile"),
          user.role === "student" ? api.request("/access/me") : Promise.resolve({ data: null })
        ]);
        const profile = response.data;
        $("#profile-name").value = profile.name || "";
        $("#profile-email").value = profile.email || "";
        $("#profile-phone").value = profile.phone || "";
        if ($("#profile-gender")) $("#profile-gender").value = profile.gender || "";
        if ($("#profile-avatar-url")) $("#profile-avatar-url").value = profile.avatar_url || profile.avatarUrl || "";
        $("#profile-document").value = profile.document || "";
        $("#profile-role").value = api.roleLabel(profile.role);
        renderProfilePhoto(profile);
        renderProfileAccess(accessResponse.data);
        setMessage("#profile-message", "", "info");
      } catch (error) {
        setMessage("#profile-message", error.message, "error", error.details);
      }
    }

    $("#profile-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      clearFieldErrors(event.currentTarget);
      setMessage("#profile-message", "Salvando perfil...", "loading");
      const data = formData(event.currentTarget);
      try {
        const response = await api.request("/profile", {
          method: "PUT",
          body: {
            name: data.name,
            phone: data.phone,
            document: data.document,
            gender: data.gender || null,
            avatarUrl: data.avatarUrl || null
          }
        });
        api.saveSession({ user: response.data });
        renderProfilePhoto(response.data);
        setMessage("#profile-message", response.message, "success");
      } catch (error) {
        applyFieldErrors(event.currentTarget, error.details);
        setMessage("#profile-message", error.message, "error", error.details);
      }
    });

    const accessPanel = $("#profile-access");
    if (accessPanel) {
      accessPanel.addEventListener("click", async (event) => {
        const button = event.target.closest("[data-cancel-access]");
        if (!button) return;
        setMessage("#profile-message", "Cancelando plano...", "loading");
        try {
          const response = await api.cancelAccess(Number(button.dataset.cancelAccess));
          setMessage("#profile-message", response.message, "success");
          await loadProfile();
        } catch (error) {
          setMessage("#profile-message", error.message, "error", error.details);
        }
      });
    }

    $("#password-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      clearFieldErrors(event.currentTarget);
      setMessage("#password-message", "Alterando senha...", "loading");
      const data = formData(event.currentTarget);
      try {
        const response = await api.request("/profile/password", {
          method: "PUT",
          body: {
            currentPassword: data.currentPassword,
            newPassword: data.newPassword,
            confirmPassword: data.confirmPassword
          }
        });
        event.currentTarget.reset();
        setMessage("#password-message", response.message, "success");
      } catch (error) {
        applyFieldErrors(event.currentTarget, error.details);
        setMessage("#password-message", error.message, "error", error.details);
      }
    });

    await loadProfile();
  }

  async function initGestao() {
    const user = await api.requireAuth(["institution_admin", "instructor"]);
    if (!user) return;
    const institutionId = currentInstitutionOrStop(user, "#management-message");
    if (!institutionId) return;
    const isAdmin = user.role === "institution_admin";
    const tbody = $("#students-table");
    const classesTable = $("#dojo-classes-table");
    const classForm = $("#dojo-class-form");
    const addressForm = $("#dojo-address-form");
    const addressPreview = $("#dojo-address-preview");
    const subscriptionPanel = $("#dojo-subscription");
    const attendanceDate = $("#attendance-date");
    const attendanceTable = $("#attendance-table");

    $all("[data-admin-only]").forEach((item) => {
      item.hidden = !isAdmin;
    });
    if (attendanceDate) attendanceDate.value = new Date().toISOString().slice(0, 10);

    function renderSubscription(subscription) {
      if (!subscriptionPanel) return;
      if (!isAdmin) {
        subscriptionPanel.hidden = true;
        return;
      }
      const price = formatCurrency(subscription.price_cents || subscription.monthly_fee_cents || 6900);
      const isActive = subscription.status === "active";
      subscriptionPanel.innerHTML = `
        <h2 style="font-size:18px; margin-bottom:8px;">Plano DOJO</h2>
        <p><strong>${html(subscription.plan_name || "Plano DOJO")}</strong> - ${price}/mês</p>
        <p style="color:${isActive ? "#64748B" : "#991B1B"};">${isActive ? `Status: ativo | Pago até: ${api.formatDate(subscription.paid_until || subscription.next_billing_at)}` : "Sem plano ativo. A instituição precisa assinar para criar ou gerenciar aulas."}</p>
        ${user.role === "institution_admin" ? `<a class="btn-secondary" style="display:inline-block; width:auto; margin-top:12px; padding:10px 18px;" href="planos.html">${isActive ? "Gerenciar mensalidade" : "Assinar Plano DOJO"}</a>` : ""}
      `;
    }

    function renderAddress(institution) {
      if (!addressForm || !addressPreview) return;
      $("#dojo-zip-code").value = institution.zip_code || "";
      $("#dojo-number").value = institution.number || "";
      $("#dojo-complement").value = institution.complement || "";
      addressPreview.textContent = [
        institution.formatted_address,
        institution.latitude && institution.longitude ? `Coordenadas: ${institution.latitude}, ${institution.longitude}` : "Coordenadas pendentes"
      ].filter(Boolean).join(" | ");
    }

    function renderClasses(classes) {
      if (!classesTable) return;
      classesTable.innerHTML = classes.length ? classes.map((item) => `
        <tr>
          <td>${html(item.title)}</td>
          <td>${html(item.modality_name)}</td>
          <td>${(item.schedules || []).map((schedule) => `${api.dayLabel(schedule.day_of_week)} ${api.timeLabel(schedule.start_time)}-${api.timeLabel(schedule.end_time)}`).join("<br>") || "-"}</td>
          <td>${item.status === "active" ? "Ativa" : "Inativa"}</td>
          <td>
            ${isAdmin ? `<button class="btn-secondary" style="width:auto; padding:8px 12px;" data-class-status="${item.id}" data-next-status="${item.status === "active" ? "inactive" : "active"}">
              ${item.status === "active" ? "Inativar" : "Ativar"}
            </button>` : "-"}
          </td>
        </tr>
      `).join("") : `<tr><td colspan="5">Nenhuma aula cadastrada.</td></tr>`;
    }

    async function loadRoster() {
      if (!attendanceTable || !attendanceDate) return;
      try {
        const params = new URLSearchParams({
          institutionId,
          date: attendanceDate.value
        });
        const response = await api.request(`/checkin/roster?${params.toString()}`);
        const items = response.data.items || [];
        attendanceTable.innerHTML = items.length ? items.map((item) => `
          <tr>
            <td>${html(item.student_name)}</td>
            <td>${html(item.class_title)}<br><small>${html(item.modality_name)}</small></td>
            <td>${api.dayLabel(item.day_of_week)} ${api.timeLabel(item.start_time)}-${api.timeLabel(item.end_time)}</td>
            <td>${html(api.statusLabel(item.attendance_status || "pending"))}</td>
            <td>
              <button class="btn-secondary" style="width:auto; padding:8px 12px;" data-attendance-booking="${item.booking_id}" data-attendance-status="present">Presente</button>
              <button class="btn-cancel" type="button" data-attendance-booking="${item.booking_id}" data-attendance-status="absent">Ausente</button>
            </td>
          </tr>
        `).join("") : `<tr><td colspan="5">Nenhuma aula agendada para a data selecionada.</td></tr>`;
      } catch (error) {
        setMessage("#management-message", error.message, "error", error.details);
      }
    }

    async function loadDojoData() {
      const [subscription, institution, classes] = await Promise.all([
        api.request(`/dojo/subscription?institutionId=${institutionId}`),
        api.request(`/institutions/${institutionId}`),
        api.request(`/dojo/classes?institutionId=${institutionId}`)
      ]);

      renderSubscription(subscription.data);
      renderAddress(institution.data);
      renderClasses(classes.data);
      if (isAdmin && $("#class-modality")) {
        $("#class-modality").innerHTML = institution.data.modalities.map((item) => `
          <option value="${item.id}">${html(item.name)}</option>
        `).join("");
      }
    }

    setMessage("#management-message", "Carregando gestão...", "loading");
    try {
      const studentsRequest = api.request(`/institutions/${institutionId}/students`);
      const dashboard = isAdmin ? await api.request(`/dashboard/institution/${institutionId}`) : null;
      const students = await studentsRequest;
      if (dashboard) {
        setText("#active-students", dashboard.data.active_students ?? 0);
        setText("#attendance-rate", `${dashboard.data.attendance_rate ?? 0}%`);
        setText("#risk-rate", `${dashboard.data.dropout_risk_rate ?? 0}%`);
      }
      tbody.innerHTML = students.data.length ? students.data.map((student) => `
        <tr>
          <td>${html(student.name)}</td>
          <td>${html(student.modality_name)}</td>
          <td>${html(api.statusLabel(student.enrollment_status))}</td>
          <td>
            ${isAdmin ? `<a href="perfil-aluno.html?id=${student.id}">Ver perfil</a><a href="avaliar-aluno.html?id=${student.id}" style="margin-left: 12px;">Avaliar</a>` : "Aluno ativo"}
          </td>
        </tr>
      `).join("") : `<tr><td colspan="4">Nenhum aluno ativo encontrado.</td></tr>`;
      await loadDojoData();
      await loadRoster();
      setMessage("#management-message", "", "info");
    } catch (error) {
      setMessage("#management-message", error.message, "error", error.details);
    }

    if (isAdmin && addressForm) {
      addressForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        setMessage("#management-message", "Atualizando endereço...", "loading");
        try {
          const data = formData(addressForm);
          const response = await api.request(`/institutions/${institutionId}/address`, {
            method: "PUT",
            body: data
          });
          addressPreview.textContent = `${response.data.formattedAddress || "Endereço salvo"} | Status: ${api.geocodingStatusLabel(response.data.geocodingStatus)}`;
          setMessage("#management-message", response.message, "success");
        } catch (error) {
          setMessage("#management-message", error.message, "error", error.details);
        }
      });
    }

    if (isAdmin && classForm) {
      classForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        setMessage("#management-message", "Criando aula...", "loading");
        const data = formData(classForm);
        try {
          const response = await api.request("/classes", {
            method: "POST",
            body: {
              institutionId,
              modalityId: Number(data.modalityId),
              title: data.title,
              description: data.description || null,
              capacity: Number(data.capacity),
              dayOfWeek: Number(data.dayOfWeek),
              startTime: data.startTime,
              endTime: data.endTime,
              roomName: data.roomName || null
            }
          });
          classForm.reset();
          $("#class-capacity").value = 20;
          await loadDojoData();
          setMessage("#management-message", response.message, "success");
        } catch (error) {
          setMessage("#management-message", error.message, "error", error.details);
        }
      });
    }

    if (isAdmin && classesTable) {
      classesTable.addEventListener("click", async (event) => {
        const button = event.target.closest("[data-class-status]");
        if (!button) return;
        setMessage("#management-message", "Atualizando aula...", "loading");
        try {
          const response = await api.request(`/classes/${button.dataset.classStatus}/status`, {
            method: "PATCH",
            body: { status: button.dataset.nextStatus }
          });
          await loadDojoData();
          setMessage("#management-message", response.message, "success");
        } catch (error) {
          setMessage("#management-message", error.message, "error", error.details);
        }
      });
    }

    if (attendanceDate) {
      attendanceDate.addEventListener("change", loadRoster);
    }

    if (attendanceTable) {
      attendanceTable.addEventListener("click", async (event) => {
        const button = event.target.closest("[data-attendance-booking]");
        if (!button) return;
        setMessage("#management-message", "Atualizando chamada...", "loading");
        try {
          const response = await api.request("/checkin/manual", {
            method: "POST",
            body: {
              bookingId: Number(button.dataset.attendanceBooking),
              status: button.dataset.attendanceStatus
            }
          });
          await loadRoster();
          setMessage("#management-message", response.message, "success");
        } catch (error) {
          setMessage("#management-message", error.message, "error", error.details);
        }
      });
    }
  }

  async function initPerfilAluno() {
    const user = await api.requireAuth(["institution_admin"]);
    if (!user) return;
    const studentId = new URLSearchParams(window.location.search).get("id");
    if (!studentId) {
      setMessage("#student-profile-message", "Selecione um aluno pela tela de gestão.", "error");
      return;
    }

    setMessage("#student-profile-message", "Carregando aluno...", "loading");
    try {
      const [profile, progress, evaluations] = await Promise.all([
        api.request(`/students/${studentId}/profile`),
        api.request(`/students/${studentId}/progress`),
        api.request(`/students/${studentId}/evaluations`)
      ]);
      setText("#student-name", profile.data.name);
      setText("#student-modality", profile.data.modality_name || "-");
      setText("#student-attendance", `${profile.data.attendance_rate ?? 0}%`);
      setText("#student-score", profile.data.average_score ?? 0);
      setText("#student-gender", api.genderLabel(profile.data.gender));
      setText("#student-plan", profile.data.plan_name || "Sem plano ativo");
      setText("#student-plan-expiration", profile.data.plan_expires_at ? api.formatDate(profile.data.plan_expires_at) : "-");
      const avatar = $("#student-avatar");
      if (avatar) {
        avatar.innerHTML = profile.data.avatar_url
          ? `<img src="${html(profile.data.avatar_url)}" alt="Foto de ${html(profile.data.name)}">`
          : `<span>${html(initials(profile.data.name))}</span>`;
      }
      $("#evaluate-link").href = `avaliar-aluno.html?id=${studentId}`;
      $("#progress-list").innerHTML = progress.data.length ? progress.data.map((item) => `
        <div class="timeline-row">
          <span>${api.formatMonth(item.reference_month)}</span>
          <strong>Nota ${item.average_score} | Presença ${item.attendance_rate}% | Risco ${html(api.riskLabel(item.risk_level))}</strong>
        </div>
      `).join("") : `<div class="empty-state">Sem histórico de progresso.</div>`;
      $("#evaluation-list").innerHTML = evaluations.data.length ? evaluations.data.map((item) => `
        <div class="timeline-row">
          <span>${api.formatDate(item.created_at)} - ${html(item.modality_name)}</span>
          <strong>${item.score}</strong>
          <small>${html(item.comment || "Sem comentário.")}</small>
        </div>
      `).join("") : `<div class="empty-state">Sem avaliações registradas.</div>`;
      setMessage("#student-profile-message", "", "info");
    } catch (error) {
      setMessage("#student-profile-message", error.message, "error", error.details);
    }
  }

  async function initAvaliarAluno() {
    const user = await api.requireAuth(["institution_admin"]);
    if (!user) return;
    const institutionId = currentInstitutionOrStop(user, "#evaluation-message");
    if (!institutionId) return;
    const selectedId = new URLSearchParams(window.location.search).get("id");
    const studentSelect = $("#student-id");
    let students = [];

    function syncStudent() {
      const selected = students.find((student) => String(student.id) === studentSelect.value);
      setText("#student-modality-label", selected ? selected.modality_name : "-");
      $("#modality-id").value = selected ? selected.modality_id : "";
    }

    setMessage("#evaluation-message", "Carregando alunos...", "loading");
    try {
      const response = await api.request(`/institutions/${institutionId}/students`);
      students = response.data;
      studentSelect.innerHTML = students.map((student) => `
        <option value="${student.id}" ${String(student.id) === selectedId ? "selected" : ""}>${html(student.name)}</option>
      `).join("");
      syncStudent();
      setMessage("#evaluation-message", students.length ? "" : "Nenhum aluno disponível para avaliação.", students.length ? "info" : "error");
    } catch (error) {
      setMessage("#evaluation-message", error.message, "error", error.details);
    }

    studentSelect.addEventListener("change", syncStudent);

    $("#evaluation-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = formData(event.currentTarget);
      setMessage("#evaluation-message", "Salvando avaliação...", "loading");
      try {
        const response = await api.request(`/students/${data.studentId}/evaluations`, {
          method: "POST",
          body: {
            institutionId,
            modalityId: Number(data.modalityId),
            score: Number(data.score),
            comment: data.comment
          }
        });
        setMessage("#evaluation-message", response.message, "success");
      } catch (error) {
        setMessage("#evaluation-message", error.message, "error", error.details);
      }
    });
  }

  async function initPlanos() {
    const user = await api.requireAuth();
    if (!user) return;

    const plansList = $("#plans-list");
    const currentAccess = $("#current-access");
    const paymentResult = $("#payment-result");
    const termsAcceptance = window.FightPassTerms.createAcceptance("#plans-terms", {
      origin: "contratacao_plano"
    });
    await termsAcceptance.load();

    if (user.role !== "student") {
      const institutionId = currentInstitutionOrStop(user, "#plans-message");
      if (!institutionId) return;

      if (user.role !== "institution_admin") {
        setMessage("#plans-message", "A mensalidade DOJO pode ser gerenciada apenas pelo administrador da instituição.", "error");
        return;
      }

      async function loadDojoSubscription() {
        const response = await api.request(`/dojo/subscription?institutionId=${institutionId}`);
        const isActive = response.data.status === "active";
        currentAccess.innerHTML = `
          <h2 style="font-size:18px; margin-bottom:8px;">Mensalidade DOJO</h2>
          <p><strong>${html(response.data.plan_name || "Plano DOJO")}</strong></p>
          <p style="color:${isActive ? "#64748B" : "#991B1B"};">${isActive ? `Status: ativo | Pago até: ${api.formatDate(response.data.paid_until || response.data.next_billing_at)}` : "Sem plano ativo. Assine para disponibilizar e gerenciar aulas."}</p>
        `;
      }

      function renderDojoPayment(payment) {
        paymentResult.hidden = false;
        if (payment.method !== "pix" && payment.method !== "boleto") {
          paymentResult.innerHTML = `
            <h2 style="font-size:18px; margin-bottom:8px;">${html(api.paymentMethodLabel(payment.method))} DOJO gerado</h2>
            <p style="color:#64748B;">${html(payment.prototypeNotice)}</p>
            <div class="token-box" style="margin-top:16px;">${html(payment.referenceCode)}</div>
            <button class="btn-primary" style="width:auto; margin-top:16px; padding:12px 24px;" data-confirm-dojo-payment="${payment.id}">Confirmar pagamento ficticio</button>
          `;
          return;
        }
        paymentResult.innerHTML = payment.method === "pix" ? `
          <h2 style="font-size:18px; margin-bottom:8px;">Pix DOJO gerado</h2>
          <p style="color:#64748B;">${html(payment.prototypeNotice)}</p>
          <div class="qr-frame" style="display:inline-block; margin:18px 0;">
            <img alt="QR Code Pix fictício" style="width:220px;height:220px;" src="https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(payment.pixCode)}">
          </div>
          <div class="token-box">${html(payment.pixCode)}</div>
          <button class="btn-primary" style="width:auto; margin-top:16px; padding:12px 24px;" data-confirm-dojo-payment="${payment.id}">Confirmar pagamento fictício</button>
        ` : `
          <h2 style="font-size:18px; margin-bottom:8px;">Boleto DOJO gerado</h2>
          <p style="color:#64748B;">${html(payment.prototypeNotice)}</p>
          <div class="token-box" style="margin-top:16px;">${html(payment.boletoCode)}</div>
          <button class="btn-primary" style="width:auto; margin-top:16px; padding:12px 24px;" data-confirm-dojo-payment="${payment.id}">Confirmar pagamento fictício</button>
        `;
      }

      setMessage("#plans-message", "Carregando plano DOJO...", "loading");
      try {
        await loadDojoSubscription();
        const response = await api.request("/dojo/plans");
        plansList.innerHTML = response.data.map((plan) => `
          <article class="card-white" style="display:flex; flex-direction:column; gap:12px;">
            <h2 style="font-size:20px;">${html(plan.name)}</h2>
            <p style="color:#64748B; min-height:54px;">${html(plan.description)}</p>
            <strong style="font-size:28px; color:var(--primary-blue);">${formatCurrency(plan.priceCents)}</strong>
            <small style="color:#64748B;">Mensalidade para DOJO parceiro</small>
            ${plan.features && plan.features.length ? `<ul class="plan-features">${plan.features.map((feature) => `<li>${html(feature)}</li>`).join("")}</ul>` : ""}
            <button class="btn-primary" type="button" data-dojo-plan-id="${plan.id}">Gerar mensalidade</button>
          </article>
        `).join("");
        setMessage("#plans-message", "", "info");
      } catch (error) {
        setMessage("#plans-message", error.message, "error", error.details);
      }

      plansList.addEventListener("click", async (event) => {
        const button = event.target.closest("[data-dojo-plan-id]");
        if (!button) return;
        if (!termsAcceptance.isAccepted()) {
          setMessage("#plans-message", "Aceite os Termos de Uso antes de gerar a mensalidade.", "error");
          return;
        }
        setMessage("#plans-message", "Gerando mensalidade fictícia...", "loading");
        try {
          const response = await api.request("/dojo/payments/simulate", {
            method: "POST",
            body: {
              institutionId,
              method: $("#payment-method").value,
              ...termsAcceptance.payload()
            }
          });
          renderDojoPayment(response.data);
          setMessage("#plans-message", response.message, "success");
        } catch (error) {
          setMessage("#plans-message", error.message, "error", error.details);
        }
      });

      paymentResult.addEventListener("click", async (event) => {
        const button = event.target.closest("[data-confirm-dojo-payment]");
        if (!button) return;
        setMessage("#plans-message", "Confirmando mensalidade fictícia...", "loading");
        try {
          const response = await api.request(`/dojo/payments/${button.dataset.confirmDojoPayment}/confirm`, {
            method: "POST"
          });
          setMessage("#plans-message", response.message, "success");
          paymentResult.hidden = true;
          await loadDojoSubscription();
        } catch (error) {
          setMessage("#plans-message", error.message, "error", error.details);
        }
      });

      return;
    }

    async function loadAccess() {
      try {
        const response = await api.request("/access/me");
        if (!response.data.hasActiveAccess) {
          currentAccess.innerHTML = `
            <h2 style="font-size: 18px; margin-bottom: 8px;">Acesso atual</h2>
            <p style="color:#991B1B;">Você não possui plano ativo. O teste de 1 dia é liberado apenas uma vez por CPF.</p>
          `;
          return;
        }

        const access = response.data.access;
        const remaining = access.sessions_total === null
          ? "Ilimitado"
          : `${Math.max(0, access.sessions_total - access.sessions_used)} treino(s)`;
        const remainingDays = daysUntil(access.expires_at);
        currentAccess.innerHTML = `
          <h2 style="font-size: 18px; margin-bottom: 8px;">Acesso atual</h2>
          <p><strong>${html(access.plan_name)}</strong></p>
          <p style="color:#64748B;">Validade: ${api.formatDate(access.expires_at)} | Treinos restantes: ${remaining}</p>
          ${remainingDays !== null && remainingDays <= 3 ? `<div class="notice-card warning">Seu plano vence ${remainingDays <= 0 ? "hoje" : `em ${remainingDays} dia(s)`}.</div>` : ""}
          <button class="btn-cancel" type="button" data-cancel-access="${access.id}" style="margin-top:14px;">Cancelar plano</button>
        `;
      } catch (error) {
        currentAccess.innerHTML = `<p style="color:#991B1B;">${html(error.message)}</p>`;
      }
    }

    function renderPayment(payment) {
      paymentResult.hidden = false;
      if (payment.method === "pix") {
        paymentResult.innerHTML = `
          <h2 style="font-size: 18px; margin-bottom: 8px;">Pix gerado</h2>
          <p style="color:#64748B;">${html(payment.prototypeNotice)}</p>
          <div class="qr-frame" style="display:inline-block; margin:18px 0;">
            <img alt="QR Code Pix fictício" style="width:220px;height:220px;" src="https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(payment.pixCode)}">
          </div>
          <div class="token-box">${html(payment.pixCode)}</div>
          <button class="btn-primary" style="width:auto; margin-top:16px; padding:12px 24px;" data-confirm-payment="${payment.id}">Confirmar pagamento fictício</button>
        `;
        return;
      }

      if (payment.method !== "boleto") {
        paymentResult.innerHTML = `
          <h2 style="font-size: 18px; margin-bottom: 8px;">${html(api.paymentMethodLabel(payment.method))} gerado</h2>
          <p style="color:#64748B;">${html(payment.prototypeNotice)}</p>
          <div class="token-box" style="margin-top:16px;">${html(payment.referenceCode)}</div>
          <button class="btn-primary" style="width:auto; margin-top:16px; padding:12px 24px;" data-confirm-payment="${payment.id}">Confirmar pagamento ficticio</button>
        `;
        return;
      }

      paymentResult.innerHTML = `
        <h2 style="font-size: 18px; margin-bottom: 8px;">Boleto gerado</h2>
        <p style="color:#64748B;">${html(payment.prototypeNotice)}</p>
        <div class="token-box" style="margin-top:16px;">${html(payment.boletoCode)}</div>
        <button class="btn-primary" style="width:auto; margin-top:16px; padding:12px 24px;" data-confirm-payment="${payment.id}">Confirmar pagamento fictício</button>
      `;
    }

    setMessage("#plans-message", "Carregando planos...", "loading");
    try {
      await loadAccess();
      const response = await api.request("/plans");
      plansList.innerHTML = response.data.length ? response.data.map((plan) => `
        <article class="card-white" style="display:flex; flex-direction:column; gap:12px;">
          <h2 style="font-size:20px;">${html(plan.name)}</h2>
          <p style="color:#64748B; min-height:54px;">${html(plan.description)}</p>
          <strong style="font-size:28px; color:var(--primary-blue);">${formatCurrency(plan.priceCents)}</strong>
          <small style="color:#64748B;">${plan.sessionLimit === null ? "Treinos ilimitados" : `${plan.sessionLimit} treino(s)`} por ${plan.durationDays} dias</small>
          ${plan.features && plan.features.length ? `<ul class="plan-features">${plan.features.map((feature) => `<li>${html(feature)}</li>`).join("")}</ul>` : ""}
          <button class="btn-primary" type="button" data-plan-id="${plan.id}">Contratar</button>
        </article>
      `).join("") : `<div class="empty-state">Nenhum plano disponivel no momento.</div>`;
      setMessage("#plans-message", "", "info");
    } catch (error) {
      setMessage("#plans-message", error.message, "error", error.details);
    }

    currentAccess.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-cancel-access]");
      if (!button) return;
      setMessage("#plans-message", "Cancelando plano...", "loading");
      try {
        const response = await api.cancelAccess(Number(button.dataset.cancelAccess));
        setMessage("#plans-message", response.message, "success");
        await loadAccess();
      } catch (error) {
        setMessage("#plans-message", error.message, "error", error.details);
      }
    });

    plansList.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-plan-id]");
      if (!button) return;
      if (!termsAcceptance.isAccepted()) {
        setMessage("#plans-message", "Aceite os Termos de Uso antes de contratar o plano.", "error");
        return;
      }

      setMessage("#plans-message", "Gerando cobrança fictícia...", "loading");
      try {
        const response = await api.request("/payments/simulate", {
          method: "POST",
          body: {
            planId: Number(button.dataset.planId),
            method: $("#payment-method").value,
            ...termsAcceptance.payload()
          }
        });
        renderPayment(response.data);
        setMessage("#plans-message", response.message, "success");
      } catch (error) {
        setMessage("#plans-message", error.message, "error", error.details);
      }
    });

    paymentResult.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-confirm-payment]");
      if (!button) return;
      setMessage("#plans-message", "Confirmando pagamento fictício...", "loading");
      try {
        const response = await api.request(`/payments/${button.dataset.confirmPayment}/confirm`, {
          method: "POST"
        });
        setMessage("#plans-message", response.message, "success");
        paymentResult.hidden = true;
        await loadAccess();
      } catch (error) {
        setMessage("#plans-message", error.message, "error", error.details);
      }
    });
  }

  const pages = {
    login: initLogin,
    cadastro: initCadastro,
    "recuperar-senha": initRecuperacaoSenha,
    dashboard: initDashboard,
    mapa: initMapa,
    agendar: initAgendar,
    planos: initPlanos,
    "minhas-aulas": initMinhasAulas,
    checkin: initCheckin,
    perfil: initPerfil,
    gestao: initGestao,
    "perfil-aluno": initPerfilAluno,
    "avaliar-aluno": initAvaliarAluno
  };

  document.addEventListener("DOMContentLoaded", () => {
    const page = document.body.dataset.page;
    if (pages[page]) {
      pages[page]();
    }
  });
})();
