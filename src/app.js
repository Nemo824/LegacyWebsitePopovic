"use strict";

const API_URL = "https://earthquake.usgs.gov/fdsnws/event/1/query";
const MAX_LIMIT = 100;

const form = document.getElementById("quake-form");
const startInput = document.getElementById("start");
const endInput = document.getElementById("end");
const magInput = document.getElementById("minmag");
const limitInput = document.getElementById("limit");
const loadBtn = document.getElementById("load-btn");
const statusEl = document.getElementById("status");
const table = document.getElementById("results");
const tbody = document.getElementById("results-body");

function setStatus(message, isError) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", Boolean(isError));
}

function clearInvalid() {
  [startInput, endInput, magInput, limitInput].forEach(function (el) {
    el.removeAttribute("aria-invalid");
  });
}

function markInvalid(el, message) {
  el.setAttribute("aria-invalid", "true");
  el.focus();
  setStatus(message, true);
  table.hidden = true;
}

// Enddatum soll vollständig mitzählen -> bis Mitternacht des Folgetags abfragen
function addDays(isoDate, days) {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Gibt die bereinigten Werte zurück oder null, wenn die Eingabe ungültig ist
function readAndValidate() {
  clearInvalid();

  const start = startInput.value;
  const end = endInput.value;
  const minMagText = magInput.value.trim();
  const limitText = limitInput.value.trim();

  if (!start) { markInvalid(startInput, "Bitte ein Startdatum wählen."); return null; }
  if (!end) { markInvalid(endInput, "Bitte ein Enddatum wählen."); return null; }
  if (start > end) {
    markInvalid(startInput, "Das Startdatum liegt nach dem Enddatum. Bitte den Zeitraum korrigieren.");
    return null;
  }

  if (minMagText === "") { markInvalid(magInput, "Bitte eine Mindestmagnitude eingeben."); return null; }
  const minMag = Number(minMagText);
  if (!Number.isFinite(minMag) || minMag < 0 || minMag > 10) {
    markInvalid(magInput, "Die Mindestmagnitude muss zwischen 0 und 10 liegen.");
    return null;
  }

  if (limitText === "") { markInvalid(limitInput, "Bitte eine maximale Anzahl eingeben."); return null; }
  const limit = Number(limitText);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    markInvalid(limitInput, "Die maximale Anzahl muss eine ganze Zahl zwischen 1 und " + MAX_LIMIT + " sein.");
    return null;
  }

  return { start: start, end: end, minMag: minMag, limit: limit };
}

// URL per Template Literal aus den Benutzereingaben zusammensetzen
function buildUrl(values) {
  const endeExklusiv = addDays(values.end, 1);
  return `${API_URL}?format=geojson&starttime=${values.start}&endtime=${endeExklusiv}&minmagnitude=${values.minMag}&limit=${values.limit}&orderby=time`;
}

function formatTime(ms) {
  if (typeof ms !== "number") { return "unbekannt"; }
  return new Date(ms).toLocaleString("de-AT", { dateStyle: "medium", timeStyle: "short" });
}

function createCell(text) {
  const td = document.createElement("td");
  td.textContent = text;
  return td;
}

function createMagnitudeCell(mag) {
  const td = document.createElement("td");
  const wrap = document.createElement("div");
  wrap.className = "mag";

  const value = document.createElement("span");
  value.className = "mag-value";
  value.textContent = typeof mag === "number" ? mag.toFixed(1) : "–";
  wrap.appendChild(value);

  if (typeof mag === "number") {
    const bar = document.createElement("span");
    bar.className = "mag-bar" + (mag < 5 ? " low" : "");
    bar.style.width = Math.max(0, Math.min(mag, 10)) * 10 + "px";
    bar.setAttribute("aria-hidden", "true");
    wrap.appendChild(bar);
  }

  td.appendChild(wrap);
  return td;
}

function renderRow(feature) {
  const props = feature.properties || {};
  const coords = feature.geometry && feature.geometry.coordinates;
  const tr = document.createElement("tr");

  tr.appendChild(createCell(props.place || "Ortsbeschreibung fehlt"));
  tr.appendChild(createMagnitudeCell(props.mag));
  tr.appendChild(createCell(formatTime(props.time)));

  const depth = Array.isArray(coords) && typeof coords[2] === "number"
    ? coords[2].toFixed(1) + " km"
    : "unbekannt";
  tr.appendChild(createCell(depth));

  const linkCell = document.createElement("td");
  if (props.url) {
    const a = document.createElement("a");
    a.href = props.url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = "Details";
    linkCell.appendChild(a);
  } else {
    linkCell.textContent = "–";
  }
  tr.appendChild(linkCell);

  return tr;
}

function renderResults(features) {
  tbody.replaceChildren();
  features.forEach(function (feature) {
    tbody.appendChild(renderRow(feature));
  });
  table.hidden = features.length === 0;
}

async function ladeDaten() {
  const values = readAndValidate();
  if (!values) {
    return;
  }

  loadBtn.disabled = true;
  table.hidden = true;
  setStatus("Daten werden geladen …", false);

  try {
    const response = await fetch(buildUrl(values));
    if (!response.ok) {
      throw new Error("Der USGS-Server antwortete mit Status " + response.status + ".");
    }

    const data = await response.json();
    if (!data || !Array.isArray(data.features)) {
      throw new Error("Die Antwort hat nicht das erwartete GeoJSON-Format.");
    }

    if (data.features.length === 0) {
      renderResults([]);
      setStatus("Keine Erdbeben gefunden. Zeitraum erweitern oder die Mindestmagnitude senken.", false);
      return;
    }

    renderResults(data.features);
    const total = data.metadata && typeof data.metadata.count === "number" ? data.metadata.count : data.features.length;
    setStatus(total + " Erdbeben von " + values.start + " bis " + values.end + " (ab Magnitude " + values.minMag + ").", false);
  } catch (error) {
    console.error("Laden fehlgeschlagen:", error);
    tbody.replaceChildren();
    table.hidden = true;
    setStatus("Die Daten konnten nicht geladen werden. " + error.message + " Bitte Verbindung prüfen und erneut versuchen.", true);
  } finally {
    loadBtn.disabled = false;
  }
}

// API-Aufruf erst nach Klick auf den Button
loadBtn.addEventListener("click", ladeDaten);

// Enter im Formular soll dasselbe auslösen, ohne die Seite neu zu laden
form.addEventListener("submit", function (event) {
  event.preventDefault();
  ladeDaten();
});
