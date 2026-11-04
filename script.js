
"use strict";

// ========================================
// CONFIGURACIÓN
// ========================================

const STORAGE_KEY = "control-horario-v1";
const DAILY_MINUTES = 480;

const MONTHS = [
  "enero", "febrero", "marzo", "abril",
  "mayo", "junio", "julio", "agosto",
  "septiembre", "octubre", "noviembre", "diciembre"
];

const WEEKDAYS = [
  "domingo", "lunes", "martes", "miércoles",
  "jueves", "viernes", "sábado"
];

const DAY_TYPES = {
  work: "Laborable",
  holiday: "Festivo",
  vacation: "Vacaciones",
  leave: "Ausencia justificada",
  rest: "Descanso / día libre"
};

const $ = id => document.getElementById(id);
const pad = n => String(n).padStart(2, "0");

// ========================================
// ESTADO DE LA APLICACIÓN
// ========================================

let currentUser = null;
let cloudSettingsExists = false;

let state = {
  initialBalance: 0,
  entries: {}
};

let selectedDate = todayISO();
let displayedMonth = monthStart(new Date());
let selectedWeek = mondayOf(new Date());

// ========================================
// FECHAS
// ========================================

function toISO(date) {
  return (
    date.getFullYear() + "-" +
    pad(date.getMonth() + 1) + "-" +
    pad(date.getDate())
  );
}

function fromISO(value) {
  const [year, month, day] =
    value.split("-").map(Number);

  return new Date(year, month - 1, day);
}

function validISO(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    toISO(fromISO(value)) === value
  );
}

function todayISO() {
  return toISO(new Date());
}

function addDays(date, amount) {
  const result = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );

  result.setDate(result.getDate() + amount);
  return result;
}

function mondayOf(date) {
  return addDays(date, -(date.getDay() + 6) % 7);
}

function monthStart(date) {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    1
  );
}

function monthEnd(date) {
  return new Date(
    date.getFullYear(),
    date.getMonth() + 1,
    0
  );
}

function isWeekday(date) {
  return date.getDay() >= 1 && date.getDay() <= 5;
}

function shortDate(date) {
  return date.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short"
  });
}

// ========================================
// FORMATO DE HORAS
// ========================================

function parseHours(value) {
  const match =
    /^(\d{1,3})(?::([0-5]\d))?$/.exec(
      String(value).trim()
    );

  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2] || 0);

  if (hours > 24 ||
      (hours === 24 && minutes > 0)) {
    return null;
  }

  return hours * 60 + minutes;
}

function formatHours(value) {
  const minutes = Math.abs(value);

  return (
    Math.floor(minutes / 60) + " h " +
    pad(minutes % 60) + " min"
  );
}

function formatBalance(value) {
  return (value >= 0 ? "+" : "−") +
    formatHours(value);
}

function balanceClass(value) {
  if (value > 0) return "positive";
  if (value < 0) return "negative";
  return "neutral";
}

function applyBalance(element, value) {
  element.textContent = formatBalance(value);

  element.classList.remove(
    "positive", "negative", "neutral"
  );

  element.classList.add(balanceClass(value));
}

function showMessage(id, message, error = false) {
  const element = $(id);
  element.textContent = message;
  element.className = error
    ? "message error"
    : "message";
}

function cloudStatus(message, error = false) {
  const element = $("cloudStatus");

  element.textContent = message;
  element.className = error
    ? "cloud-status error"
    : "cloud-status";

  element.hidden = !message;
}

// ========================================
// VALIDACIÓN DE REGISTROS
// ========================================

function validEntry(entry) {
  return (
    entry &&
    typeof entry === "object" &&
    Object.hasOwn(DAY_TYPES, entry.type) &&
    Number.isSafeInteger(entry.minutes) &&
    entry.minutes >= 0 &&
    entry.minutes <= 1440 &&
    typeof entry.note === "string" &&
    entry.note.length <= 2000
  );
}

function validBackup(data) {
  return (
    data &&
    typeof data === "object" &&
    Number.isSafeInteger(data.initialBalance) &&
    Math.abs(data.initialBalance) <= 10000000 &&
    data.entries &&
    typeof data.entries === "object" &&
    !Array.isArray(data.entries) &&
    Object.entries(data.entries).every(
      ([date, entry]) =>
        validISO(date) && validEntry(entry)
    )
  );
}

function readPreviousLocalData() {
  try {
    const saved = JSON.parse(
      localStorage.getItem(STORAGE_KEY)
    );

    return validBackup(saved) ? saved : null;
  } catch {
    return null;
  }
}

// ========================================
// AUTENTICACIÓN
// ========================================

function showLogin() {
  currentUser = null;

  $("loginScreen").hidden = false;
  $("appMain").hidden = true;
  $("logoutButton").hidden = true;
  $("settingsDialog").close();

  cloudStatus("");
}

function showApplication() {
  $("loginScreen").hidden = true;
  $("appMain").hidden = false;
  $("logoutButton").hidden = false;
}

$("loginForm").addEventListener(
  "submit",
  async event => {
    event.preventDefault();

    const email = $("loginEmail").value.trim();
    const password = $("loginPassword").value;

    const button = $("loginButton");
    button.disabled = true;
    button.textContent = "Accediendo...";

    try {
      const { data, error } =
        await supabaseClient.auth.signInWithPassword({
          email,
          password
        });

      if (error) throw error;
      if (!data.user) {
        throw new Error("No se pudo obtener el usuario.");
      }

      $("loginPassword").value = "";
      await openAccount(data.user);
    } catch (error) {
      showMessage(
        "loginMessage",
        "No se pudo iniciar sesión: " + error.message,
        true
      );
    } finally {
      button.disabled = false;
      button.textContent = "Iniciar sesión";
    }
  }
);

$("logoutButton").addEventListener(
  "click",
  async () => {
    if (!confirm("¿Quieres cerrar sesión?")) {
      return;
    }

    const { error } =
      await supabaseClient.auth.signOut();

    if (error) {
      cloudStatus(error.message, true);
      return;
    }

    state = {
      initialBalance: 0,
      entries: {}
    };

    showLogin();
  }
);

// ========================================
// CARGAR DATOS DESDE SUPABASE
// ========================================

async function openAccount(user) {
  cloudStatus("Cargando tus horas desde Supabase...");

  try {
    await loadCloudData(user.id);

    currentUser = user;
    showApplication();
    renderAll();

    cloudStatus("");
  } catch (error) {
    currentUser = null;
    showLogin();

    showMessage(
      "loginMessage",
      "No se pudieron cargar tus datos: " + error.message,
      true
    );
  }
}

async function loadCloudData(userId) {
  const entries = {};
  const pageSize = 500;

  // Paginación para recuperar todos los registros.
  for (let start = 0; ; start += pageSize) {
    const { data, error } = await supabaseClient
      .from("registros_horarios")
      .select("fecha,tipo,minutos,nota")
      .eq("user_id", userId)
      .order("fecha", { ascending: true })
      .range(start, start + pageSize - 1);

    if (error) throw error;

    for (const row of data) {
      entries[row.fecha] = {
        type: row.tipo,
        minutes: row.minutos,
        note: row.nota || ""
      };
    }

    if (data.length < pageSize) break;
  }

  const { data: config, error: configError } =
    await supabaseClient
      .from("configuracion_horaria")
      .select("saldo_inicial")
      .eq("user_id", userId)
      .maybeSingle();

  if (configError) throw configError;

  cloudSettingsExists = config !== null;

  state = {
    initialBalance: config?.saldo_inicial ?? 0,
    entries
  };
}

// ========================================
// GUARDAR Y BORRAR EN LA NUBE
// ========================================

async function saveCloudEntry(dateKey, entry) {
  if (!currentUser) {
    throw new Error("No hay sesión iniciada.");
  }

  const { error } = await supabaseClient
    .from("registros_horarios")
    .upsert({
      user_id: currentUser.id,
      fecha: dateKey,
      tipo: entry.type,
      minutos: entry.minutes,
      nota: entry.note
    }, {
      onConflict: "user_id,fecha"
    });

  if (error) throw error;
}

async function deleteCloudEntry(dateKey) {
  if (!currentUser) {
    throw new Error("No hay sesión iniciada.");
  }

  const { error } = await supabaseClient
    .from("registros_horarios")
    .delete()
    .eq("user_id", currentUser.id)
    .eq("fecha", dateKey);

  if (error) throw error;
}

async function saveCloudSettings(balance) {
  if (!currentUser) {
    throw new Error("No hay sesión iniciada.");
  }

  const { error } = await supabaseClient
    .from("configuracion_horaria")
    .upsert({
      user_id: currentUser.id,
      saldo_inicial: balance,
      actualizado_en: new Date().toISOString()
    }, {
      onConflict: "user_id"
    });

  if (error) throw error;
  cloudSettingsExists = true;
}

// ========================================
// CÁLCULO DE HORAS
// ========================================

function getEntry(key) {
  return state.entries[key] || null;
}

function workedFor(key) {
  const entry = getEntry(key);

  return entry?.type === "work"
    ? entry.minutes
    : 0;
}

function expectedFor(key) {
  const entry = getEntry(key);

  if (!entry || entry.type !== "work") {
    return 0;
  }

  return isWeekday(fromISO(key))
    ? DAILY_MINUTES
    : 0;
}

function dayBalance(key) {
  return workedFor(key) - expectedFor(key);
}

function getTotals(startKey, endKey) {
  let worked = 0;
  let expected = 0;
  let registered = 0;
  let pending = 0;

  for (
    let date = fromISO(startKey);
    toISO(date) <= endKey;
    date = addDays(date, 1)
  ) {
    const key = toISO(date);
    const entry = getEntry(key);

    if (entry) {
      registered++;
      worked += workedFor(key);
      expected += expectedFor(key);
    } else if (
      isWeekday(date) &&
      key <= todayISO()
    ) {
      pending++;
    }
  }

  return {
    worked,
    expected,
    registered,
    pending,
    balance: worked - expected
  };
}

function getMonthTotals(date) {
  return getTotals(
    toISO(monthStart(date)),
    toISO(monthEnd(date))
  );
}

function getWeekTotals(date) {
  const monday = mondayOf(date);

  return getTotals(
    toISO(monday),
    toISO(addDays(monday, 6))
  );
}

function getGlobalBalance() {
  let balance = state.initialBalance;

  for (const key of Object.keys(state.entries)) {
    if (key <= todayISO()) {
      balance += dayBalance(key);
    }
  }

  return balance;
}

// ========================================
// RESUMEN GLOBAL
// ========================================

function renderGlobalSummary() {
  const balance = getGlobalBalance();

  applyBalance($("totalBalance"), balance);

  $("balanceDescription").textContent =
    balance > 0
      ? "La empresa te debe horas"
      : balance < 0
        ? "Tienes horas pendientes"
        : "Estás al día";
}

// ========================================
// RESUMEN MENSUAL
// ========================================

function renderMonthSummary() {
  const date = displayedMonth;
  const totals = getMonthTotals(date);

  $("monthTitle").textContent =
    `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;

  $("monthWorked").textContent =
    formatHours(totals.worked);

  $("monthExpected").textContent =
    formatHours(totals.expected);

  applyBalance($("monthBalance"), totals.balance);

  $("monthBalanceText").textContent =
    totals.balance > 0
      ? "Horas a tu favor este mes"
      : totals.balance < 0
        ? "Horas que debes este mes"
        : "Sin diferencias en los días registrados";

  $("monthDays").textContent =
    `${totals.registered} días registrados`;

  $("monthPending").textContent =
    `${totals.pending} laborables pendientes`;
}

// ========================================
// RESUMEN SEMANAL
// ========================================


function renderWeekSummary() {
  const monday = selectedWeek;
  const sunday = addDays(monday, 6);

  const totals = getTotals(
    toISO(monday),
    toISO(sunday)
  );

  $("weekRange").textContent =
    `${shortDate(monday)} — ${shortDate(sunday)} ` +
    `${sunday.getFullYear()}`;

  $("weekWorked").textContent =
    formatHours(totals.worked);

  $("weekExpected").textContent =
    formatHours(totals.expected);

  applyBalance(
    $("weekBalance"),
    totals.balance
  );

  $("weekPending").textContent =
    `${totals.registered} días registrados · ` +
    `${totals.pending} laborables pendientes`;
}


// ========================================
// CALENDARIO
// ========================================

function renderCalendar() {
  const grid = $("calendarGrid");
  grid.replaceChildren();

  const first = mondayOf(displayedMonth);

  for (let i = 0; i < 42; i++) {
    const date = addDays(first, i);
    const key = toISO(date);
    const entry = getEntry(key);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "calendar-day";

    if (date.getMonth() !== displayedMonth.getMonth()) {
      button.classList.add("other-month");
    }

    if (!isWeekday(date)) {
      button.classList.add("weekend");
    }

    if (key === todayISO()) {
      button.classList.add("today");
    }

    if (key === selectedDate) {
      button.classList.add("selected");
    }

    const number = document.createElement("span");
    number.textContent = date.getDate();

    const dot = document.createElement("span");
    dot.className = "day-dot";

    if (entry) {
      dot.classList.add(
        entry.type === "work" ? "green" : "yellow"
      );
    } else if (
      isWeekday(date) &&
      key <= todayISO()
    ) {
      dot.classList.add("red");
    }

    button.append(number, dot);

    button.setAttribute(
      "aria-label",
      date.toLocaleDateString("es-ES") +
      (entry ? `, ${DAY_TYPES[entry.type]}` : "")
    );

    button.setAttribute(
      "aria-pressed",
      String(key === selectedDate)
    );

    button.addEventListener("click", () => {
  selectedDate = key;
  selectedWeek = mondayOf(date);
  displayedMonth = monthStart(date);
  renderAll();
});

    grid.append(button);
  }
}

// ========================================
// FORMULARIO DIARIO
// ========================================

function renderEntryForm() {
  const date = fromISO(selectedDate);
  const entry = getEntry(selectedDate);

  const name = WEEKDAYS[date.getDay()];

  $("selectedDayTitle").textContent =
    name.charAt(0).toUpperCase() +
    name.slice(1) +
    `, ${date.getDate()} de ${MONTHS[date.getMonth()]}`;

  $("dayType").value = entry?.type || "work";

  $("hoursInput").value =
    entry?.type === "work"
      ? `${Math.floor(entry.minutes / 60)}:${pad(entry.minutes % 60)}`
      : "";

  $("noteInput").value = entry?.note || "";
  $("entryMessage").textContent = "";

  updateTypeFields();
}

function updateTypeFields() {
  const work = $("dayType").value === "work";

  $("hoursContainer").hidden = !work;
  $("freeDayInfo").hidden = work;
}

// ========================================
// MOVIMIENTOS
// ========================================

function renderHistory() {
  const list = $("historyList");
  list.replaceChildren();

  const first = toISO(monthStart(displayedMonth));
  const last = toISO(monthEnd(displayedMonth));

  const records = Object.entries(state.entries)
    .filter(([key]) => key >= first && key <= last)
    .sort(([a], [b]) => b.localeCompare(a));

  $("historyCount").textContent =
    `${records.length} registros`;

  if (!records.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No hay registros en este mes.";
    list.append(empty);
    return;
  }

  for (const [key, entry] of records) {
    const item = document.createElement("div");
    item.className = "history-item";

    const date = document.createElement("div");
    date.className = "history-date";
    date.textContent = shortDate(fromISO(key));

    const info = document.createElement("div");
    info.className = "history-info";

    const title = document.createElement("strong");
    title.textContent =
      entry.type === "work"
        ? formatHours(entry.minutes)
        : DAY_TYPES[entry.type];

    const subtitle = document.createElement("small");
    subtitle.textContent =
      entry.note || DAY_TYPES[entry.type];

    info.append(title, subtitle);

    const balance = document.createElement("strong");
    balance.className =
      "history-balance " + balanceClass(dayBalance(key));
    balance.textContent = formatBalance(dayBalance(key));

    item.append(date, info, balance);
    list.append(item);
  }
}

// ========================================
// RESUMEN ANUAL
// ========================================

function renderYearSummary() {
  const year = displayedMonth.getFullYear();
  const tbody = $("yearTableBody");
  tbody.replaceChildren();

  $("yearTitle").textContent =
    `Resumen anual ${year}`;

  let balance = 0;

  for (let month = 0; month < 12; month++) {
    const date = new Date(year, month, 1);
    const totals = getMonthTotals(date);

    balance += totals.balance;

    const row = document.createElement("tr");

    if (month === displayedMonth.getMonth()) {
      row.classList.add("active");
    }

    const name = document.createElement("td");
    name.className = "month-name";
    name.textContent = MONTHS[month];

    const worked = document.createElement("td");
    worked.textContent = formatHours(totals.worked);

    const delta = document.createElement("td");
    delta.textContent = formatBalance(totals.balance);
    delta.className = balanceClass(totals.balance);

    row.append(name, worked, delta);

    row.addEventListener("click", () => {
      displayedMonth = date;
      selectedDate = toISO(date);
      renderAll();

      window.scrollTo({
        top: 0,
        behavior: "smooth"
      });
    });

    tbody.append(row);
  }

  applyBalance($("yearBalance"), balance);
}

function renderAll() {
  renderGlobalSummary();
  renderMonthSummary();
  renderWeekSummary();
  renderCalendar();
  renderEntryForm();
  renderHistory();
  renderYearSummary();
}

// ========================================
// GUARDAR JORNADA EN SUPABASE
// ========================================

$("entryForm").addEventListener(
  "submit",
  async event => {
    event.preventDefault();

    const type = $("dayType").value;
    const note = $("noteInput").value.trim();

    if (!Object.hasOwn(DAY_TYPES, type)) return;

    const minutes = type === "work"
      ? parseHours($("hoursInput").value)
      : 0;

    if (minutes === null) {
      showMessage(
        "entryMessage",
        "Introduce horas válidas, por ejemplo 8:16.",
        true
      );
      return;
    }

    if (note.length > 2000) {
      showMessage(
        "entryMessage",
        "La observación es demasiado larga.",
        true
      );
      return;
    }

    if (selectedDate > todayISO() && type === "work") {
      showMessage(
        "entryMessage",
        "No puedes registrar horas futuras.",
        true
      );
      return;
    }

    const key = selectedDate;
    const entry = { type, minutes, note };

    showMessage("entryMessage", "Guardando en la nube...");

    const button =
      $("entryForm").querySelector('[type="submit"]');
    button.disabled = true;

    try {
      await saveCloudEntry(key, entry);

      state.entries[key] = entry;
      renderAll();

      showMessage(
        "entryMessage",
        "Jornada guardada en Supabase."
      );
    } catch (error) {
      showMessage(
        "entryMessage",
        "No se pudo guardar: " + error.message,
        true
      );
    } finally {
      button.disabled = false;
    }
  }
);

// ========================================
// ELIMINAR JORNADA
// ========================================

$("deleteEntry").addEventListener(
  "click",
  async () => {
    const key = selectedDate;

    if (!getEntry(key)) {
      showMessage(
        "entryMessage",
        "Este día no tiene registro.",
        true
      );
      return;
    }

    if (!confirm("¿Eliminar este registro de la nube?")) {
      return;
    }

    const button = $("deleteEntry");
    button.disabled = true;

    try {
      await deleteCloudEntry(key);

      delete state.entries[key];
      renderAll();

      showMessage(
        "entryMessage",
        "Registro eliminado correctamente."
      );
    } catch (error) {
      showMessage(
        "entryMessage",
        "Error al eliminar: " + error.message,
        true
      );
    } finally {
      button.disabled = false;
    }
  }
);

$("dayType").addEventListener(
  "change",
  updateTypeFields
);


// ========================================
// NAVEGACIÓN SEMANAL
// ========================================

$("prevWeek").addEventListener("click", () => {
  selectedWeek = addDays(selectedWeek, -7);

  // Mostrar también el mes al que pertenece
  // el lunes de la semana seleccionada.
  displayedMonth = monthStart(selectedWeek);
  selectedDate = toISO(selectedWeek);

  renderAll();
});

$("nextWeek").addEventListener("click", () => {
  selectedWeek = addDays(selectedWeek, 7);

  displayedMonth = monthStart(selectedWeek);
  selectedDate = toISO(selectedWeek);

  renderAll();
});


// ========================================
// NAVEGACIÓN MENSUAL
// ========================================




function changeMonth(offset) {
  displayedMonth = new Date(
    displayedMonth.getFullYear(),
    displayedMonth.getMonth() + offset,
    1
  );

  selectedDate = toISO(displayedMonth);
  selectedWeek = mondayOf(displayedMonth);

  renderAll();
}

$("prevMonth").addEventListener(
  "click",
  () => changeMonth(-1)
);

$("nextMonth").addEventListener(
  "click",
  () => changeMonth(1)
);

$("todayButton").addEventListener("click", () => {
  selectedDate = todayISO();
  selectedWeek = mondayOf(new Date());
  displayedMonth = monthStart(new Date());
  renderAll();
});


// ========================================
// CONFIGURACIÓN
// ========================================

$("settingsButton").addEventListener("click", () => {
  $("initialBalance").value = state.initialBalance;
  $("settingsMessage").textContent = "";
  $("settingsDialog").showModal();
});

$("closeSettings").addEventListener("click", () => {
  $("settingsDialog").close();
});

$("saveSettings").addEventListener(
  "click",
  async () => {
    const input = $("initialBalance").value;
    const balance = Number(input);

    if (
      input.trim() === "" ||
      !Number.isSafeInteger(balance) ||
      Math.abs(balance) > 10000000
    ) {
      showMessage(
        "settingsMessage",
        "Introduce un saldo válido en minutos.",
        true
      );
      return;
    }

    try {
      await saveCloudSettings(balance);

      state.initialBalance = balance;
      renderAll();

      showMessage(
        "settingsMessage",
        "Saldo inicial guardado en Supabase."
      );
    } catch (error) {
      showMessage(
        "settingsMessage",
        "Error: " + error.message,
        true
      );
    }
  }
);

// ========================================
// EXPORTAR COPIA DE SEGURIDAD
// ========================================

$("exportButton").addEventListener("click", () => {
  const blob = new Blob(
    [JSON.stringify(state, null, 2)],
    { type: "application/json" }
  );

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download =
    `control-horario-${todayISO()}.json`;

  document.body.append(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

// ========================================
// IMPORTACIÓN SEGURA A LA NUBE
// ========================================

// Solo añade fechas que todavía no existan.
// No sobrescribe jornadas ya guardadas.
async function mergeBackup(backup) {
  if (!currentUser) {
    throw new Error("Debes iniciar sesión.");
  }

  if (!validBackup(backup)) {
    throw new Error("Copia de seguridad no válida.");
  }

  // Obtener la situación actual de Supabase.
  await loadCloudData(currentUser.id);

  const missing = Object.entries(backup.entries)
    .filter(([key]) => !Object.hasOwn(state.entries, key));

  // Insertar en lotes, sin sobrescribir conflictos.
  for (let i = 0; i < missing.length; i += 100) {
    const batch = missing.slice(i, i + 100)
      .map(([key, entry]) => ({
        user_id: currentUser.id,
        fecha: key,
        tipo: entry.type,
        minutos: entry.minutes,
        nota: entry.note
      }));

    const { error } = await supabaseClient
      .from("registros_horarios")
      .upsert(batch, {
        onConflict: "user_id,fecha",
        ignoreDuplicates: true
      });

    if (error) throw error;
  }

  // Solo importar el saldo anterior si no existe
  // configuración en la nube.
  if (!cloudSettingsExists) {
    await saveCloudSettings(backup.initialBalance);
  }

  await loadCloudData(currentUser.id);
  renderAll();

  return missing.length;
}

// ========================================
// IMPORTAR JSON
// ========================================

$("importButton").addEventListener("click", () => {
  $("importFile").click();
});

$("importFile").addEventListener(
  "change",
  async event => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const backup = JSON.parse(await file.text());

      if (!validBackup(backup)) {
        throw new Error("Formato JSON incorrecto.");
      }

      if (!confirm(
        "Se añadirán las fechas que falten en la nube. " +
        "Los registros existentes no se sobrescribirán. " +
        "¿Continuar?"
      )) return;

      showMessage(
        "settingsMessage",
        "Importando registros..."
      );

      const count = await mergeBackup(backup);

      showMessage(
        "settingsMessage",
        `${count} registros enviados a Supabase.`
      );
    } catch (error) {
      showMessage(
        "settingsMessage",
        "Error al importar: " + error.message,
        true
      );
    } finally {
      event.target.value = "";
    }
  }
);

// ========================================
// MIGRAR REGISTROS LOCALES
// ========================================

$("migrateButton").addEventListener(
  "click",
  async () => {
    const backup = readPreviousLocalData();

    if (!backup) {
      showMessage(
        "settingsMessage",
        "No se encontraron registros locales válidos. " +
        "Puedes importar un archivo JSON.",
        true
      );
      return;
    }

    if (!confirm(
      "¿Importar tus antiguas horas locales " +
      "sin sobrescribir las que ya están en Supabase?"
    )) return;

    try {
      showMessage(
        "settingsMessage",
        "Migrando tus horas anteriores..."
      );

      const count = await mergeBackup(backup);

      showMessage(
        "settingsMessage",
        `${count} registros antiguos incorporados.`
      );
    } catch (error) {
      showMessage(
        "settingsMessage",
        "Error al migrar: " + error.message,
        true
      );
    }
  }
);

// ========================================
// RECARGAR AL VOLVER A LA WEB
// ========================================

// Si modificas una jornada en otro dispositivo,
// se recuperarán los cambios al volver a esta pestaña.
document.addEventListener(
  "visibilitychange",
  async () => {
    if (
      document.visibilityState !== "visible" ||
      !currentUser
    ) return;

    try {
      await loadCloudData(currentUser.id);
      renderAll();
      cloudStatus("");
    } catch (error) {
      cloudStatus(
        "No se pudieron actualizar los datos: " +
        error.message,
        true
      );
    }
  }
);

// ========================================
// INICIALIZACIÓN
// ========================================

async function init() {
  $("loginScreen").hidden = true;
  $("appMain").hidden = true;
  $("logoutButton").hidden = true;

  cloudStatus("Comprobando sesión...");

  try {
    const { data, error } =
      await supabaseClient.auth.getUser();

    if (error || !data.user) {
      showLogin();
      return;
    }

    await openAccount(data.user);
  } catch (error) {
    showLogin();
    showMessage(
      "loginMessage",
      "Error de conexión: " + error.message,
      true
    );
  }
}

init();
