// Scout Desk. Research display only. No requests except this computer's desk API.

const state = {
  payload: null,
  selectedId: null,
  geom: null,
};

const boardEl = document.getElementById("board");
const detailEl = document.getElementById("detail");
const ideasEl = document.getElementById("ideas");
const statusEl = document.getElementById("status");
const clockEl = document.getElementById("clock");
const ideasMeta = document.getElementById("ideas-meta");
const refreshBtn = document.getElementById("refresh");

refreshBtn.addEventListener("click", () => load(true));
window.addEventListener("resize", drawVisibleChart);
document.addEventListener("keydown", onKey);
setInterval(tickClock, 1000);
tickClock();
load(false);
setInterval(() => load(false), 60_000);

function tickClock() {
  const text = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(new Date());
  clockEl.textContent = `${text} UK`;
}

async function load(force) {
  statusEl.classList.remove("bad");
  if (!state.payload) statusEl.textContent = "Loading prices from the public chart feed…";
  try {
    const response = await fetch(force ? "/api/desk?refresh=1" : "/api/desk", { cache: "no-store" });
    if (!response.ok) throw new Error(`Desk HTTP ${response.status}`);
    const payload = await response.json();
    if (!payload || !Array.isArray(payload.rows)) throw new Error("Desk sent an unexpected payload");
    state.payload = payload;
    if (!payload.rows.some((row) => row.id === state.selectedId)) {
      const first = payload.rows.find((row) => row.last != null) ?? payload.rows[0];
      state.selectedId = first ? first.id : null;
    }
    paint();
  } catch (err) {
    statusEl.classList.add("bad");
    statusEl.textContent = state.payload
      ? "Could not refresh. The last view is still on screen."
      : "Could not load the desk. Leave npm run desk running, then press Refresh.";
    console.error(err);
  }
}

function paint() {
  const payload = state.payload;
  const priced = payload.rows.filter((row) => row.last != null).length;
  statusEl.classList.remove("bad");
  statusEl.textContent = `${payload.scan.summary} Watchlist ${priced}/${payload.rows.length} with a price. Yahoo v8 charts. Refreshes about once a minute.`;
  renderBoard();
  renderDetail();
  renderIdeas();
}

function renderBoard() {
  const table = el("table");
  const head = el("thead");
  const headRow = el("tr");
  for (const label of ["Symbol", "Last", "Change", "%", "Volume"]) {
    headRow.append(el("th", { class: label === "Volume" ? "vol" : "", text: label }));
  }
  head.append(headRow);
  const body = el("tbody");
  for (const row of state.payload.rows) {
    const tr = el("tr", { "data-id": row.id, tabindex: "0" });
    if (row.id === state.selectedId) tr.classList.add("selected");
    tr.append(symbolCell(row));
    tr.append(numCell(row.lastText, row.tone));
    tr.append(numCell(row.changeText, row.tone));
    tr.append(numCell(row.changePercentText, row.tone));
    const volume = el("td", { class: `vol ${row.volume.status}`, text: row.volume.line });
    tr.append(volume);
    tr.addEventListener("click", () => select(row.id));
    tr.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        select(row.id);
      }
    });
    body.append(tr);
  }
  table.append(head, body);
  const legend = el("p", { class: "legend" });
  legend.append(
    el("i", { class: "backing", text: "Backing the move" }),
    document.createTextNode(" · "),
    el("i", { class: "not_confirming", text: "Not confirming" }),
    document.createTextNode(" · grey means volume is not available. The figure is the scanner's check on the latest hour."),
  );
  boardEl.replaceChildren(table, legend);
}

function renderDetail() {
  const row = selectedRow();
  const title = document.getElementById("detail-title");
  if (!row) {
    title.textContent = "Quote";
    detailEl.replaceChildren(el("p", { class: "empty", text: "No symbol on the watchlist." }));
    state.geom = null;
    return;
  }
  title.textContent = `${row.id} · ${row.name}`;
  const grid = el("div", { class: "quote-grid" });
  grid.append(
    stat("Last", row.lastText, row.tone, row.error),
    stat("Change", row.changeText, row.tone, row.changePercentText),
    stat("Previous", row.previousCloseText, "flat", "Prior close in the feed"),
    stat("Last bar", row.lastBar ? row.lastBar.slice(11) : "—", "flat", row.lastBar ? row.lastBar.slice(0, 10) : "1-hour"),
  );
  const volume = el("div", { class: "volume-block" });
  volume.append(
    el("div", { class: "volume-kicker", text: "Live volume" }),
    el("p", { class: `volume-line ${row.volume.status}`, text: row.volume.line }),
  );
  const chartBlock = el("div", { class: "chart-block" });
  const canvas = el("canvas", { id: "chart" });
  const ohlc = el("p", { id: "ohlc" });
  const note = el("p", {
    class: "chart-note",
    text: row.chart.length
      ? "1-hour bars from the same public chart feed as the scanner."
      : "No 1-hour bars in the feed.",
  });
  chartBlock.append(canvas, ohlc, note);
  canvas.addEventListener("mousemove", (event) => hoverBar(event, row));
  canvas.addEventListener("mouseleave", () => showBar(row, row.chart.length - 1));
  const blocks = [grid, volume, chartBlock];
  const plans = ideasFor(row.id);
  if (plans.length) blocks.push(planBlock(plans));
  detailEl.replaceChildren(...blocks);
  requestAnimationFrame(() => {
    drawChart(canvas, row);
    showBar(row, row.chart.length - 1);
  });
}

function renderIdeas() {
  const alerts = state.payload.alerts;
  ideasMeta.textContent = alerts.found
    ? `${alerts.file}${alerts.updatedLabel ? ` · file ${alerts.updatedLabel}` : ""}`
    : alerts.file;
  if (!alerts.ideas.length) {
    const box = el("div", { class: "empty" });
    box.append(
      el("p", { text: "No A or A+ alerts for today." }),
      el("p", {
        class: "reason",
        text: alerts.found
          ? "Today's file has no A or A+ line."
          : "The scanner has not written today's alert file on this PC yet.",
      }),
    );
    ideasEl.replaceChildren(box);
    return;
  }
  const note = el("p", { class: "plan-note", text: "Alert / research plan only. Nothing is sent." });
  note.style.padding = "8px 10px 0";
  const cards = alerts.ideas.map((idea) => ideaCard(idea));
  ideasEl.replaceChildren(note, ...cards);
}

function ideaCard(idea) {
  const card = el("article", { class: "idea" });
  const top = el("div", { class: "idea-top" });
  const sym = el("button", { class: "sym-btn", type: "button", text: idea.symbol });
  sym.addEventListener("click", () => select(idea.symbol));
  top.append(
    el("span", { class: "grade", text: idea.grade }),
    el("span", { class: `side ${idea.side}`, text: idea.side === "long" ? "LONG" : "SHORT" }),
    sym,
    el("span", { class: "when", text: `${idea.time} UK` }),
  );
  const levels = el("div", { class: "levels" });
  for (const [label, value] of [
    ["Entry", idea.entry],
    ["Stop", idea.stop],
    ["Half / 1R", idea.half],
    ["2R", idea.target],
    ["Trigger", idea.trigger],
    ["Level", idea.level],
  ]) {
    const cell = el("div");
    cell.append(el("span", { text: label }), el("b", { text: value }));
    levels.append(cell);
  }
  card.append(top, levels);
  card.append(el("p", { class: `volume-line ${volumeClass(idea.volumeLine)}`, text: idea.volumeLine }));
  if (idea.reason) card.append(el("p", { class: "reason", text: idea.reason }));
  if (idea.paired) card.append(el("p", { class: "paired", text: `Paired ${idea.paired}` }));
  if (idea.size) card.append(el("p", { class: "size", text: `Size in the alert: ${idea.size}` }));
  return card;
}

function planBlock(ideas) {
  const block = el("div", { class: "plan" });
  block.append(el("div", { class: "kicker", text: "From today's alert file" }));
  block.append(el("p", { class: "plan-note", text: "Alert / research plan only. Nothing is sent." }));
  for (const idea of ideas) block.append(ideaCard(idea));
  return block;
}

function select(id) {
  if (!state.payload?.rows.some((row) => row.id === id)) return;
  state.selectedId = id;
  for (const tr of boardEl.querySelectorAll("tr[data-id]")) {
    tr.classList.toggle("selected", tr.getAttribute("data-id") === id);
  }
  renderDetail();
  const selected = boardEl.querySelector("tr.selected");
  selected?.scrollIntoView({ block: "nearest" });
}

function onKey(event) {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  if (!state.payload?.rows.length) return;
  const tag = document.activeElement?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return;
  event.preventDefault();
  const ids = state.payload.rows.map((row) => row.id);
  let index = ids.indexOf(state.selectedId);
  if (index < 0) index = 0;
  index = event.key === "ArrowDown" ? Math.min(ids.length - 1, index + 1) : Math.max(0, index - 1);
  select(ids[index]);
}

function selectedRow() {
  return state.payload?.rows.find((row) => row.id === state.selectedId) ?? null;
}

function ideasFor(id) {
  return state.payload?.alerts.ideas.filter((idea) => idea.symbol === id) ?? [];
}

function drawVisibleChart() {
  const canvas = document.getElementById("chart");
  const row = selectedRow();
  if (canvas && row) drawChart(canvas, row);
}

function drawChart(canvas, row) {
  const bars = row.chart;
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth || 640;
  const height = canvas.clientHeight || 280;
  canvas.width = Math.max(1, Math.floor(width * dpr));
  canvas.height = Math.max(1, Math.floor(height * dpr));
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#0c100c";
  ctx.fillRect(0, 0, width, height);
  if (!bars.length) {
    ctx.fillStyle = "#8f8b80";
    ctx.font = "13px Consolas, monospace";
    ctx.fillText("No 1-hour bars in the feed.", 16, 32);
    state.geom = null;
    return;
  }
  const showVol = bars.some((bar) => bar.v != null && bar.v > 0);
  const pad = { top: 14, right: 78, bottom: 22, left: 10 };
  const volH = showVol ? Math.round((height - pad.top - pad.bottom) * 0.2) : 0;
  const gap = showVol ? 10 : 0;
  const plotH = height - pad.top - pad.bottom - volH - gap;
  const plotW = Math.max(1, width - pad.left - pad.right);
  let lo = Infinity;
  let hi = -Infinity;
  for (const bar of bars) {
    lo = Math.min(lo, bar.l);
    hi = Math.max(hi, bar.h);
  }
  if (!(hi > lo)) {
    const padPx = Math.abs(hi) * 0.002 || 1;
    hi += padPx;
    lo -= padPx;
  } else {
    const padPx = (hi - lo) * 0.08;
    hi += padPx;
    lo -= padPx;
  }
  const yOf = (price) => pad.top + ((hi - price) / (hi - lo)) * plotH;
  const slot = plotW / bars.length;
  state.geom = { pad, plotW, slot, bars, showVol, volH, gap, plotH };
  ctx.font = "11px Consolas, ui-monospace, monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  for (let i = 0; i < 4; i++) {
    const price = hi - ((hi - lo) * i) / 3;
    const py = yOf(price);
    ctx.strokeStyle = "rgba(245, 176, 66, 0.16)";
    ctx.beginPath();
    ctx.moveTo(pad.left, py);
    ctx.lineTo(pad.left + plotW, py);
    ctx.stroke();
    ctx.fillStyle = "#f5b042";
    ctx.fillText(formatNum(price, row.digits), pad.left + plotW + 6, py);
  }
  bars.forEach((bar, i) => {
    const x = pad.left + slot * i + slot / 2;
    const up = bar.c >= bar.o;
    ctx.strokeStyle = up ? "#3ddc97" : "#ff5c5c";
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, yOf(bar.h));
    ctx.lineTo(x, yOf(bar.l));
    ctx.stroke();
    const top = yOf(Math.max(bar.o, bar.c));
    const bot = yOf(Math.min(bar.o, bar.c));
    const bw = Math.max(1, slot * 0.64);
    ctx.fillRect(x - bw / 2, top, bw, Math.max(1, bot - top));
  });
  const last = bars[bars.length - 1];
  ctx.strokeStyle = "rgba(245, 176, 66, 0.9)";
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(pad.left, yOf(last.c));
  ctx.lineTo(pad.left + plotW, yOf(last.c));
  ctx.stroke();
  ctx.setLineDash([]);
  if (showVol) {
    let maxV = 0;
    for (const bar of bars) if (bar.v != null && bar.v > maxV) maxV = bar.v;
    const base = pad.top + plotH + gap + volH;
    bars.forEach((bar, i) => {
      if (bar.v == null || !(bar.v > 0) || !(maxV > 0)) return;
      const x = pad.left + slot * i + slot / 2;
      const bw = Math.max(1, slot * 0.64);
      const h = (bar.v / maxV) * (volH - 2);
      ctx.fillStyle = bar.c >= bar.o ? "rgba(61, 220, 151, 0.8)" : "rgba(255, 92, 92, 0.8)";
      ctx.fillRect(x - bw / 2, base - h, bw, h);
    });
  }
  ctx.fillStyle = "#8f8b80";
  ctx.textBaseline = "alphabetic";
  const marks = [0, Math.floor((bars.length - 1) / 2), bars.length - 1];
  const seen = new Set();
  for (const index of marks) {
    if (seen.has(index)) continue;
    seen.add(index);
    ctx.fillText(ukStamp(bars[index].t), pad.left + slot * index, height - 6);
  }
}

function hoverBar(event, row) {
  const geom = state.geom;
  if (!geom) return;
  const rect = event.currentTarget.getBoundingClientRect();
  const x = event.clientX - rect.left - geom.pad.left;
  if (x < 0 || x > geom.plotW) return;
  const index = Math.min(geom.bars.length - 1, Math.max(0, Math.floor(x / geom.slot)));
  showBar(row, index);
}

function showBar(row, index) {
  const node = document.getElementById("ohlc");
  const bar = row.chart[index];
  if (!node) return;
  if (!bar) {
    node.textContent = "";
    return;
  }
  const bits = [
    ukStamp(bar.t),
    `O ${formatNum(bar.o, row.digits)}`,
    `H ${formatNum(bar.h, row.digits)}`,
    `L ${formatNum(bar.l, row.digits)}`,
    `C ${formatNum(bar.c, row.digits)}`,
  ];
  if (bar.v != null) bits.push(`V ${compact(bar.v)}`);
  node.textContent = bits.join("  ");
}

function stat(label, value, tone, sub) {
  const cell = el("div", { class: "stat" });
  cell.append(el("span", { text: label }), el("b", { class: tone || "flat", text: value }));
  if (sub) cell.append(el("em", { text: sub }));
  return cell;
}

function symbolCell(row) {
  const td = el("td", { class: "sym" });
  td.append(el("span", { class: "id", text: row.id }));
  td.append(el("span", { class: "name", text: row.name }));
  if (row.error) td.append(el("span", { class: "err", text: row.error }));
  return td;
}

function numCell(text, tone) {
  return el("td", { class: tone || "flat", text });
}

function volumeClass(line) {
  if (line.startsWith("Volume: backing")) return "backing";
  if (line.startsWith("Volume: not confirming")) return "not_confirming";
  return "unavailable";
}

function formatNum(value, digits) {
  return new Intl.NumberFormat("en-GB", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    useGrouping: true,
  }).format(value);
}

function compact(value) {
  return new Intl.NumberFormat("en-GB", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function ukStamp(ms) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(ms));
}

function el(tag, attrs, children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value == null || value === false) continue;
    if (key === "class") node.className = String(value);
    else if (key === "text") node.textContent = String(value);
    else node.setAttribute(key, String(value));
  }
  for (const child of children ?? []) node.append(child);
  return node;
}
