/* =========================================================================
   Material Selector - Frontend logic
   =========================================================================
   KHÁC BIỆT so với bản gốc (Offline):
   - KHÔNG còn database (DATA/METAL) nhúng cứng trong file này.
   - Cần đăng nhập (username/password thật, JWT token) mới xem được database —
     xem khối AUTH bên dưới.
   - Mọi lọc/tìm kiếm được gửi lên backend API (xem config.js) và backend
     chỉ trả về CÁC DÒNG KHỚP điều kiện lọc — không trả toàn bộ database.
   - Import Excel/CSV giờ xử lý ở backend (chỉ role admin), không còn SheetJS
     chạy trong trình duyệt.
   - ELEMENTS (bảng tuần hoàn) là dữ liệu công khai nên vẫn để client-side,
     nạp từ elements.json.
   ========================================================================= */

// $, Auth, apiGet/apiPost/apiDelete, showLogin/hideLogin, updateWhoAmI được
// định nghĩa trong auth-client.js (nạp trước file này — xem index.html)

const RESIN_HEX = { "Elastomer / Rubber": "#2f6fb0", "Thermoplastic": "#2e8b57", "Nylon (Polyamide)": "#c9741f", "Thermoset (Resin)": "#7a5aa8", "Metallic": "#64748b" };
const RCOL = (r) => RESIN_HEX[r] || "#7b8794";

// Hansen solubility delta (tham khảo công khai, không nhạy cảm) - dùng cho drawer chi tiết
const DELTA = { "NBR": 19.5, "HNBR": 19, "EPDM": 16.5, "FKM": 16.5, "FFKM": 14, "CR (Neoprene)": 18.7, "Silicone": 15.0, "Butyl (IIR)": 16.5, "PTFE": 12.7, "PEEK": 22, "PPS": 20, "ETFE": 16, "PVC / UPVC": 19.5, "Polyamide (Nylon)": 23, "Aramid": 28 };
function deltaFor(f) { f = f || ""; for (const k in DELTA) { if (f === k || f.indexOf(k) >= 0 || k.indexOf(f) >= 0) return DELTA[k]; } return null; }

function extLinks(q) {
  const e = encodeURIComponent((q || "").trim());
  return `<a class="ext mw" target="_blank" rel="noopener" href="https://www.matweb.com/search/QuickText.aspx?SearchText=${e}">MatWeb</a><a class="ext pc" target="_blank" rel="noopener" href="https://pubchem.ncbi.nlm.nih.gov/#query=${e}">PubChem</a><a class="ext ni" target="_blank" rel="noopener" href="https://webbook.nist.gov/cgi/cbook.cgi?Name=${e}&Units=SI">NIST WebBook</a>`;
}
function rowRefs(q) {
  const e = encodeURIComponent((q || "").trim());
  return `<a class="reflink pc" target="_blank" rel="noopener" href="https://pubchem.ncbi.nlm.nih.gov/#query=${e}">PubChem ↗</a><a class="reflink ni" target="_blank" rel="noopener" href="https://webbook.nist.gov/cgi/cbook.cgi?Name=${e}&Units=SI">NIST ↗</a>`;
}
function updateChemLinks() {
  const q = $("chem").value.trim();
  $("chemLinks").innerHTML = q ? extLinks(q) : "";
}

// Gọi từ updateWhoAmI() (auth-client.js) mỗi khi biết vai trò user
function onAuthReady() {
  // chỉ admin mới thấy nút cập nhật database + link trang quản lý user
  const isAdmin = Auth.role === "admin";
  $("loadBtn").parentElement.style.display = isAdmin ? "" : "none";
  const adminLink = $("adminLink");
  if (adminLink) adminLink.style.display = isAdmin ? "inline-block" : "none";
}

// debounce nhỏ để không spam API mỗi phím gõ
function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/* ======================= ELASTOMER SEARCH TAB ========================= */

const F = { kw: "", resins: new Set(), fam: "", hScale: "A", hMin: null, hMax: null, tenMin: null, tempAt: null, uv: new Set(), chem: "", chemMode: "good" };
const COLF = {};
let lastElastomerResults = [];

function buildFilterPayload() {
  return {
    kw: F.kw, resins: [...F.resins], fam: F.fam, hScale: F.hScale,
    hMin: F.hMin, hMax: F.hMax, tenMin: F.tenMin, tempAt: F.tempAt,
    uv: [...F.uv], chem: F.chem, chemMode: F.chemMode, colf: { ...COLF },
  };
}

async function rebuildFacets() {
  const facets = await apiGet("/api/elastomers/facets");
  const resinBox = $("resinBox"); resinBox.innerHTML = ""; F.resins.clear();
  facets.resins.forEach((r) => resinBox.insertAdjacentHTML("beforeend",
    `<label class="chk"><input type="checkbox" value="${r}"><span class="swatch" style="background:${RCOL(r)}"></span>${r}</label>`));
  resinBox.querySelectorAll("input").forEach((i) => i.onchange = () => { i.checked ? F.resins.add(i.value) : F.resins.delete(i.value); render(); });

  const famSel = $("famSel"); famSel.innerHTML = '<option value="">— All —</option>'; F.fam = "";
  facets.families.forEach((f) => famSel.insertAdjacentHTML("beforeend", `<option>${f}</option>`));
  famSel.onchange = (e) => { F.fam = e.target.value; render(); };

  const COLSPEC = [["name", "text"], ["family", "select"], ["hardness", "text"], ["tensile", "text"], ["elong", "text"], ["temp", "text"], ["uv", "select"], ["trade", "text"], ["", ""]];
  const colf = $("colf"); colf.innerHTML = ""; for (const k in COLF) delete COLF[k];
  COLSPEC.forEach(([field, type]) => {
    const th = document.createElement("th");
    if (type === "text") th.innerHTML = `<input type="text" data-c="${field}" placeholder="filter…">`;
    else if (type === "select") {
      const opts = field === "uv" ? facets.uvLevels : facets.families;
      th.innerHTML = `<select data-c="${field}"><option value="">all</option>${opts.map((o) => `<option>${o}</option>`).join("")}</select>`;
    }
    colf.appendChild(th);
  });
  colf.querySelectorAll("[data-c]").forEach((el) => el.oninput = el.onchange = () => {
    const c = el.dataset.c, v = el.value.trim();
    if (v) COLF[c] = v; else delete COLF[c];
    render();
  });
  $("nMat").textContent = facets.total;
}

["Excellent", "Good", "Fair", "Poor"].forEach((u) => $("uvBox").insertAdjacentHTML("beforeend", `<label class="chk"><input type="checkbox" value="${u}"><span class="uv ${u}">${u}</span></label>`));
document.querySelectorAll("#uvBox input").forEach((i) => i.onchange = () => { i.checked ? F.uv.add(i.value) : F.uv.delete(i.value); render(); });

const bind = (id, key, num) => { $(id).oninput = (e) => { const v = e.target.value.trim(); F[key] = v === "" ? (num ? null : "") : (num ? Number(v) : v); render(); }; };
bind("kw", "kw"); bind("hMin", "hMin", 1); bind("hMax", "hMax", 1); bind("tenMin", "tenMin", 1); bind("tempAt", "tempAt", 1); bind("chem", "chem");
$("chem").addEventListener("input", updateChemLinks);
$("hScale").onchange = (e) => { F.hScale = e.target.value; render(); };
$("chemMode").onchange = (e) => { F.chemMode = e.target.value; render(); };
$("resetBtn").onclick = () => location.reload();
$("printBtn").onclick = printReport;
$("colToggle").onclick = () => { const r = $("colf"); r.style.display = r.style.display === "none" ? "table-row" : "none"; };

function chipsHTML() {
  const c = [];
  if (F.kw) c.push(["Keyword", F.kw, "kw"]);
  F.resins.forEach((r) => c.push(["Group", r, "resin:" + r]));
  if (F.fam) c.push(["Family", F.fam, "fam"]);
  if (F.hMin != null || F.hMax != null) c.push(["Shore " + F.hScale, `${F.hMin ?? ""}–${F.hMax ?? ""}`, "hard"]);
  if (F.tenMin != null) c.push(["Tensile", "≥" + F.tenMin, "ten"]);
  if (F.tempAt != null) c.push(["Temp", "incl. " + F.tempAt + "°C", "temp"]);
  F.uv.forEach((u) => c.push(["UV", u, "uv:" + u]));
  if (F.chem) c.push([F.chemMode === "good" ? "Compatible" : "Exclude", F.chem, "chem"]);
  return c.map(([k, v, t]) => `<span class="chip"><b>${k}:</b> ${v} <button data-t="${t}">×</button></span>`).join("");
}

const renderNow = async () => {
  let data;
  try {
    data = await apiPost("/api/elastomers/search", buildFilterPayload());
  } catch (err) {
    $("rows").innerHTML = `<tr><td colspan="9">⚠ Không kết nối được backend API. Kiểm tra config.js / server có đang chạy không.</td></tr>`;
    console.error(err);
    return;
  }
  const list = data.results;
  lastElastomerResults = list;
  $("cnt").textContent = data.count;

  const chips = $("chips");
  chips.innerHTML = chipsHTML();
  chips.querySelectorAll("button").forEach((b) => b.onclick = () => clearTok(b.dataset.t));

  $("rows").innerHTML = list.map((d, i) => {
    const term = (d.trade && d.trade.split(",")[0].trim()) || d.family || d.name;
    return `<tr data-i="${i}"><td style="border-left-color:${RCOL(d.resin)}"><b>${d.name}</b></td><td><span class="tag" style="background:${RCOL(d.resin)}">${d.family}</span></td><td class="num">${d.hardness || "—"}</td><td class="num">${d.tensile || "—"}</td><td class="num">${d.elong || "—"}</td><td class="num">${d.temp || "—"}</td><td><span class="uv ${d.uv}">${d.uv}</span></td><td>${d.trade || "—"}</td><td onclick="event.stopPropagation()">${rowRefs(term)}</td></tr>`;
  }).join("");
  $("rows").querySelectorAll("tr").forEach((tr) => tr.onclick = () => openDrawer(lastElastomerResults[tr.dataset.i]));

  const emp = $("empty");
  if (list.length) emp.style.display = "none";
  else {
    const q = F.chem || F.kw || F.fam || "material";
    emp.style.display = "block";
    emp.innerHTML = `No material in the database matches these criteria.<br><br>Look up "<b>${q}</b>" on external sources:<div class="extlinks" style="justify-content:center;margin-top:12px">${extLinks(q)}</div>`;
  }
};
const render = debounce(renderNow, 200);

function clearTok(t) {
  if (t === "kw") { F.kw = ""; $("kw").value = ""; }
  else if (t.startsWith("resin:")) { const r = t.slice(6); F.resins.delete(r); $("resinBox").querySelectorAll("input").forEach((i) => { if (i.value === r) i.checked = false; }); }
  else if (t === "fam") { F.fam = ""; $("famSel").value = ""; }
  else if (t === "hard") { F.hMin = F.hMax = null; $("hMin").value = ""; $("hMax").value = ""; }
  else if (t === "ten") { F.tenMin = null; $("tenMin").value = ""; }
  else if (t === "temp") { F.tempAt = null; $("tempAt").value = ""; }
  else if (t.startsWith("uv:")) { const u = t.slice(3); F.uv.delete(u); document.querySelectorAll("#uvBox input").forEach((i) => { if (i.value === u) i.checked = false; }); }
  else if (t === "chem") { F.chem = ""; $("chem").value = ""; updateChemLinks(); }
  render();
}

const drawer = $("drawer"), backdrop = $("backdrop");
function openDrawer(d) {
  if (!d) return;
  const term = (d.trade && d.trade.split(",")[0].trim()) || d.family || d.name;
  const dl = deltaFor(d.family);
  drawer.innerHTML = `<div class="dhead" style="background:${RCOL(d.resin)}"><button class="closeX" onclick="closeDrawer()">×</button><h2>${d.name}</h2><div class="fam">${d.resin} · ${d.family}</div></div>
  <div class="dbody"><dl class="kv"><dt>Hardness</dt><dd>${d.hardness || "—"}</dd><dt>Tensile</dt><dd>${d.tensile || "—"} MPa</dd><dt>Elongation</dt><dd>${d.elong || "—"} %</dd><dt>Comp. set / creep</dt><dd>${d.compset || "—"}</dd><dt>Temp min/max</dt><dd>${d.temp || "—"} °C</dd><dt>UV resistance</dt><dd>${d.uv}</dd>${dl ? ("<dt>Solubility δ</dt><dd>≈ " + dl + " MPa½" + (d.resin === "Metallic" ? " (n/a)" : "") + "</dd>") : ""}<dt>Trade names</dt><dd style="font-family:var(--body)">${d.trade || "—"}</dd></dl>
  <div class="compat good"><h4>✔ Compatible with</h4>${d.good || "—"}</div><div class="compat poor"><h4>✘ Attacked / limited by</h4>${d.poor || "—"}</div>
  <div style="margin:4px 0 12px"><h4 style="font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink2);margin-bottom:6px">Look up properties</h4><div class="extlinks">${extLinks(term)}</div></div>
  <div class="hint">Source: ${d.source || "—"}</div></div>`;
  drawer.classList.add("open"); backdrop.classList.add("show");
}
function closeDrawer() { drawer.classList.remove("open"); backdrop.classList.remove("show"); }
backdrop.onclick = closeDrawer;
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDrawer(); });

function printReport() {
  const list = lastElastomerResults;
  const crit = $("chips").textContent.replace(/×/g, "").trim() || "(no filter — all materials)";
  $("report").innerHTML = `<h2 style="font-family:Tahoma">Material selection report</h2><p style="font-size:11px">Criteria: ${crit} &nbsp;|&nbsp; Materials: ${list.length} &nbsp;|&nbsp; ${new Date().toLocaleString("en-GB")}</p>
  <table><thead><tr><th>#</th><th>Material</th><th>Group</th><th>Family</th><th>Hardness</th><th>Tensile (MPa)</th><th>Elong (%)</th><th>Comp.set</th><th>Temp (°C)</th><th>UV</th><th>Compatible with</th><th>Attacked by</th><th>Source</th></tr></thead><tbody>
  ${list.map((d, i) => `<tr><td>${i + 1}</td><td>${d.name}</td><td>${d.resin}</td><td>${d.family}</td><td>${d.hardness}</td><td>${d.tensile}</td><td>${d.elong}</td><td>${d.compset}</td><td>${d.temp}</td><td>${d.uv}</td><td>${d.good}</td><td>${d.poor}</td><td>${d.source || ""}</td></tr>`).join("")}</tbody></table>`;
  window.print();
}

// filler cards (nội dung tham khảo tĩnh, không nhạy cảm)
const FILLERS = [
  { base: "PEEK", resin: "Thermoplastic", items: [["Virgin / Unfilled", "Best chemical resistance & toughness; baseline."], ["Glass fibre 30%", "Higher stiffness & dimensional stability, lower creep."], ["Carbon fibre 30%", "Highest strength/stiffness, wear & thermal conductivity."], ["Bearing grade", "Self-lubricating, low friction — bushings & wear parts."]] },
  { base: "PTFE", resin: "Thermoplastic", items: [["Virgin PTFE", "Near-universal resistance, low friction; high creep."], ["Glass 15–25%", "Improves creep & wear, retains chemical resistance."], ["Carbon / Graphite", "Wear/compression, conductive, anti-stick."], ["Bronze 40–60%", "Extrusion resistance, thermal conductivity, load — NOT corrosive/electrical."]] },
  { base: "Elastomers", resin: "Elastomer / Rubber", items: [["Carbon black", "Reinforces mechanical & wear, UV screening."], ["Silica / mineral", "Tear strength, hardness tuning."], ["Plasticiser", "Lowers hardness, low-temp flex — may be extracted by solvents."]] },
  { base: "Metallic (seats/gaskets)", resin: "Metallic", items: [["Stellite / hardfacing", "Cobalt-chromium overlay — wear & galling."], ["Graphite/PTFE filler", "Soft element in spiral-wound gaskets."], ["CRA cladding", "Corrosion-resistant overlay on carbon steel."]] },
];
document.getElementById("fillerCards").innerHTML = FILLERS.map((f) => `<div class="fcard"><div class="top" style="background:${RCOL(f.resin)}"><h3>${f.base}</h3><span>base + filler by purpose</span></div><div class="body">${f.items.map((it) => `<div class="filler"><b>${it[0]}</b><div class="why">${it[1]}</div></div>`).join("")}</div></div>`).join("");

/* ======================= PERIODIC TABLE (public data) ================= */

const CATCOLOR = { "alkali metal": "#e8938a", "alkaline earth metal": "#f0b878", "transition metal": "#f2d97a", "post-transition metal": "#a9c7ad", "metalloid": "#7fbfae", "polyatomic nonmetal": "#7cc0d1", "diatomic nonmetal": "#77a3d6", "noble gas": "#a99bd6", "lanthanide": "#dca9cf", "actinide": "#cf9cbb" };
function catColor(c) { c = c || ""; for (const k in CATCOLOR) if (c.indexOf(k) >= 0) return CATCOLOR[k]; return "#c9ced6"; }
let ELEMENTS = [];
async function buildPeriodic() {
  ELEMENTS = await (await fetch("elements.json")).json();
  const g = $("ptable");
  ELEMENTS.forEach((e) => {
    if (!e.x || !e.y) return;
    const d = document.createElement("div"); d.className = "el";
    d.style.gridColumn = e.x; d.style.gridRow = e.y; d.style.background = catColor(e.cat);
    d.innerHTML = `<span class="z">${e.z}</span><span class="sym">${e.sym}</span><span class="ma">${e.mass || ""}</span>`;
    d.onclick = () => showEl(e); g.appendChild(d);
  });
  const cats = [...new Set(ELEMENTS.map((e) => e.cat))].filter((c) => c && c.indexOf("unknown") < 0);
  $("ptLegend").innerHTML = cats.map((c) => `<span><i style="background:${catColor(c)}"></i>${c}</span>`).join("");
}
function showEl(e) {
  $("elInfo").innerHTML = `<div class="nm" style="border-left:6px solid ${catColor(e.cat)};padding-left:10px">${e.name} <span style="font-family:var(--mono);color:var(--ink2)">(${e.sym}, Z=${e.z})</span></div>
  <div class="grid"><div>Atomic mass: <b>${e.mass || "—"}</b></div><div>Electronegativity χ: <b>${e.en ?? "—"}</b></div><div>1st ionization: <b>${e.ie ? e.ie + " kJ/mol" : "—"}</b></div><div>Category: <b>${e.cat}</b></div><div>Config: <b>${e.cfg || "—"}</b></div><div>Phase (STP): <b>${e.phase || "—"}</b></div></div>
  <div class="extlinks">${extLinks(e.name)}</div>`;
}

/* ============================== TABS ==================================== */
function showTab(w) {
  ["searchTab", "ptTab", "guideTab", "mtTab"].forEach((id) => $(id).style.display = "none");
  ["tabSearch", "tabPT", "tabGuide", "tabMT"].forEach((id) => $(id).classList.remove("active"));
  const M = { s: ["searchTab", "tabSearch"], p: ["ptTab", "tabPT"], g: ["guideTab", "tabGuide"], m: ["mtTab", "tabMT"] };
  $(M[w][0]).style.display = "block"; $(M[w][1]).classList.add("active");
}
$("tabSearch").onclick = () => showTab("s");
$("tabPT").onclick = () => showTab("p");
$("tabGuide").onclick = () => showTab("g");
$("tabMT").onclick = () => showTab("m");

/* ========================= METALS SEARCH TAB =========================== */

function wmCol(v) { return v === "Easy" ? "#e2efda" : (v === "Hard" ? "#f6d3cb" : "#fdf0d0"); }
let lastMetalResults = [];

const renderMetalNow = async () => {
  const kw = ($("mKw").value || "").trim();
  const fam = $("mFam").value;
  let data;
  try {
    data = await apiPost("/api/metals/search", { kw, fam });
  } catch (err) {
    $("mRows").innerHTML = `<tr><td colspan="10">⚠ Không kết nối được backend API.</td></tr>`;
    console.error(err);
    return;
  }
  const list = data.results;
  lastMetalResults = list;
  $("mCount").textContent = data.count;
  $("mRows").innerHTML = list.map((m, i) => {
    return `<tr data-i="${i}" style="cursor:pointer;border-bottom:1px solid var(--line)">`
      + `<td style="padding:6px 8px"><b>${m.name}</b><div style="font-size:10px;color:#777;font-family:var(--mono)">${m.uns}</div></td>`
      + `<td style="padding:6px 8px">${m.family}</td>`
      + `<td class="num" style="padding:6px 8px;text-align:center">${m.pren}</td>`
      + `<td class="num" style="padding:6px 8px;text-align:center">${m.ni2mo}</td>`
      + `<td class="num" style="padding:6px 8px">${m.hard}</td>`
      + `<td class="num" style="padding:6px 8px">${m.uts}</td>`
      + `<td class="num" style="padding:6px 8px">${m.ys}</td>`
      + `<td class="num" style="padding:6px 8px;text-align:center">${m.elong}</td>`
      + `<td style="padding:6px 8px;text-align:center;background:${wmCol(m.weld)}">${m.weld}</td>`
      + `<td style="padding:6px 8px;text-align:center;background:${wmCol(m.mach)}">${m.mach}</td></tr>`;
  }).join("");
  $("mRows").querySelectorAll("tr").forEach((tr) => tr.onclick = () => showMetal(lastMetalResults[tr.dataset.i]));
};
const renderMetal = debounce(renderMetalNow, 200);

function parseComp(str) {
  if (!str) return [];
  return str.split(",").map((s) => s.trim()).filter(Boolean).map((tok) => {
    const m = tok.match(/^([≤~]?[\d.]+(?:[–-][\d.]+)?)\s*([A-Za-z][A-Za-z0-9]*)$/);
    if (m) return { el: m[2], val: m[1] };
    return { el: tok, val: "bal." };
  });
}
function compTable(str) {
  const items = parseComp(str);
  if (!items.length) return "";
  return `<table style="width:100%;border-collapse:collapse;font-size:12px;margin:6px 0 10px;text-align:center">`
    + `<tr>${items.map((i) => `<th style="padding:5px 7px;border:1px solid var(--line);background:#eef1f5;color:#12253b">%${i.el}</th>`).join("")}</tr>`
    + `<tr>${items.map((i) => `<td style="padding:5px 7px;border:1px solid var(--line);font-family:var(--mono)">${i.val}</td>`).join("")}</tr>`
    + `</table>`;
}
function showMetal(m) {
  if (!m) return;
  const box = (l, v) => `<td style="padding:5px 9px;border:1px solid var(--line);vertical-align:top"><span style="font-size:11px;color:var(--ink2)">${l}</span><br><b class="mono">${v}</b></td>`;
  $("mDetail").innerHTML = `<div style="display:flex;justify-content:space-between;align-items:baseline;border-left:6px solid #64748b;padding-left:10px">`
    + `<div class="nm">${m.name} <span style="font-family:var(--mono);color:var(--ink2);font-size:14px">(${m.uns})</span></div>`
    + `<div style="font-size:12px;color:#64748b;font-weight:700">${m.family}</div></div>`
    + `<div style="margin:8px 0 4px;padding:8px 11px;background:#f2f5f9;border-radius:6px;font-size:13px"><b>Composition:</b> ${m.comp}</div>`
    + compTable(m.comp)
    + `<table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:8px"><tr>`
    + box("PREN", m.pren) + box("Ni+2Mo", m.ni2mo) + box("Hardness", m.hard) + box("Ductility", m.elong + "%")
    + `</tr><tr>`
    + box("Tensile", m.uts + " MPa") + box("Yield", m.ys + " MPa") + box("Weldability", m.weld) + box("Machinability", m.mach)
    + `</tr></table>`
    + `<div style="margin-bottom:8px;font-size:13px"><b>Metallurgy:</b> ${m.notes}</div>`
    + `<div class="compat good"><h4>✔ Suits</h4>${m.suits}</div>`
    + `<div class="compat poor"><h4>✘ Limit / avoid</h4>${m.limits}</div>`
    + `<div class="extlinks">${extLinks(m.name)}</div>`;
}
async function initMetal() {
  const facets = await apiGet("/api/metals/facets");
  const fam = $("mFam");
  facets.families.forEach((f) => fam.insertAdjacentHTML("beforeend", `<option>${f}</option>`));
  $("mKw").oninput = renderMetal; $("mFam").onchange = renderMetal;
  renderMetalNow();
}

/* ==================== ADMIN: cập nhật database qua Excel/CSV =========== */
/* Nút này chỉ hiển thị khi role === "admin" (xem updateWhoAmI()).
   Không cần nhập API key riêng nữa — token đăng nhập (JWT) đã mang theo role. */

$("loadBtn").onclick = () => $("csvFile").click();
$("csvFile").onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const fd = new FormData();
  fd.append("file", f);
  $("dataInfo").innerHTML = `Đang tải lên & xử lý <b>${f.name}</b>…`;
  try {
    const res = await fetch(API_BASE + "/api/import", {
      method: "POST",
      headers: { "Authorization": `Bearer ${Auth.token}` },
      body: fd,
    });
    const json = await res.json();
    if (!res.ok) {
      if (res.status === 401) { Auth.clear(); showLogin("Phiên đăng nhập hết hạn, vui lòng đăng nhập lại."); }
      else alert("Lỗi: " + (json.detail || res.status));
      $("dataInfo").innerHTML = `Built-in dataset · <b id="nMat">${$("nMat").textContent}</b> materials`;
      return;
    }
    $("dataInfo").innerHTML = `Loaded <b>${f.name}</b> · <b id="nMat">${json.count}</b> materials`;
    await rebuildFacets();
    renderNow();
  } catch (err) {
    alert("Không kết nối được backend API.");
    console.error(err);
  }
  e.target.value = "";
};

/* ================================ BOOT =================================== */
// boot() được gọi từ auth-client.js (sau khi đăng nhập thành công / nếu đã có token)
async function boot() {
  try {
    await rebuildFacets();
    renderNow();
    buildPeriodic();
    initMetal();
  } catch (err) {
    console.error(err);
    // Hiện lỗi ra bảng thay vì để trống (trước đây lỗi chỉ nằm trong Console)
    $("cnt").textContent = "0";
    $("chips").innerHTML = "";
    $("rows").innerHTML = `<tr><td colspan="9" style="color:#b4472b;padding:14px">⚠ Không tải được dữ liệu từ backend: ${err.message}. Mở <a href="${API_BASE}/api/health" target="_blank">${API_BASE}/api/health</a> để kiểm tra file data.</td></tr>`;
  }
}
initAuthOnLoad();
