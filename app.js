// ═══════════════════════════════════════════════
//  LLM PRICING CALCULATOR  ·  app.js
// ═══════════════════════════════════════════════

let activeProviders = new Set(Object.keys(PROVIDERS));
let currentView     = "list";
let sidebarOpen     = true;
let activeMainTab   = "compare";
let activeStab      = "usage";
let useINR          = false;
const USD_TO_INR    = 84;

// ════════════════════════════════════════════
//  SINGLE DOMContentLoaded — fixes blank screen
// ════════════════════════════════════════════
document.addEventListener("DOMContentLoaded", () => {
  buildProviderList();
  buildSpecsTable();

  // Set default view to list
  const gridEl = document.getElementById("resultsGrid");
  if (gridEl) gridEl.className = "results-list";
  document.getElementById("viewGrid")?.classList.remove("active");
  document.getElementById("viewList")?.classList.add("active");

  // Wire up search clear-button visibility
  const searchEl = document.getElementById("modelSearch");
  if (searchEl) {
    searchEl.addEventListener("input", function () {
      const clearBtn = document.getElementById("searchClear");
      if (clearBtn) clearBtn.classList.toggle("visible", this.value.length > 0);
    });
  }

  renderAll();
});

// ════════════════════════════════════════════
//  TAB NAVIGATION
// ════════════════════════════════════════════

function switchTab(tab) {
  activeMainTab = tab;
  document.querySelectorAll(".main-tab").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  document.querySelectorAll(".tab-panel").forEach(p => p.classList.toggle("active", p.id === `tab-${tab}`));
  if (tab === "bestpick") renderBestPick();
  if (tab === "chart")    renderChart(getFilteredModels());
}

function switchStab(stab) {
  activeStab = stab;
  document.querySelectorAll(".stab").forEach(b => b.classList.toggle("active", b.dataset.stab === stab));
  document.querySelectorAll(".stab-panel").forEach(p => p.classList.toggle("active", p.id === `stab-${stab}`));
}

// ════════════════════════════════════════════
//  SIDEBAR TOGGLE
// ════════════════════════════════════════════

function toggleSidebar() {
  sidebarOpen = !sidebarOpen;
  document.getElementById("shell").classList.toggle("sidebar-closed", !sidebarOpen);
  document.getElementById("sidebarToggle").classList.toggle("open", sidebarOpen);
}

// ════════════════════════════════════════════
//  PROVIDER LIST
// ════════════════════════════════════════════

function buildProviderList() {
  const container = document.getElementById("providerList");
  if (!container) return;
  container.innerHTML = "";

  Object.entries(PROVIDERS).forEach(([key, p]) => {
    const count = MODELS.filter(m => m.provider === key).length;
    const item  = document.createElement("label");
    item.className = "provider-item";
    item.style.setProperty("--pcolor", p.color);
    item.innerHTML = `
      <input type="checkbox" checked data-provider="${key}" onchange="toggleProvider('${key}', this.checked)" />
      <span class="provider-dot" style="background:${p.color}"></span>
      <span class="provider-item-name">${p.logo} ${p.name}</span>
      <span class="provider-count">${count}</span>
    `;
    container.appendChild(item);
  });
}

function toggleProvider(key, checked) {
  if (checked) {
    activeProviders.add(key);
  } else {
    if (activeProviders.size === 1) {
      document.querySelector(`[data-provider="${key}"]`).checked = true;
      return;
    }
    activeProviders.delete(key);
  }
  renderAll();
}

function selectAllProviders() {
  activeProviders = new Set(Object.keys(PROVIDERS));
  document.querySelectorAll("#providerList input[type=checkbox]").forEach(cb => cb.checked = true);
  renderAll();
}

function clearProviders() {
  const keys = Object.keys(PROVIDERS);
  activeProviders = new Set([keys[0]]);
  document.querySelectorAll("#providerList input[type=checkbox]").forEach((cb, i) => {
    cb.checked = i === 0;
  });
  renderAll();
}

// ════════════════════════════════════════════
//  READ FORM PARAMS
// ════════════════════════════════════════════

function getParams() {
  return {
    inputTokens:    Math.max(0, +document.getElementById("inputTokens").value    || 0),
    outputTokens:   Math.max(0, +document.getElementById("outputTokens").value   || 0),
    requestsPerDay: Math.max(1, +document.getElementById("requestsPerDay").value || 1),
    days:           Math.max(1, +document.getElementById("days").value           || 1),
  };
}

function getActiveTiers() {
  return [...document.querySelectorAll("#tierFilter input:checked")].map(c => c.value);
}

function getActiveSpeeds() {
  return [...document.querySelectorAll("#speedFilter input:checked")].map(c => c.value);
}

function getMinCtx() {
  const el = document.querySelector("input[name='minCtx']:checked");
  return el ? +el.value : 0;
}

function getMaxBudget() {
  const v = +document.getElementById("maxBudget").value;
  return isNaN(v) || v <= 0 ? Infinity : v;
}

function getSortBy() {
  return document.querySelector("input[name='sortBy']:checked")?.value || "cost";
}

function getSearchQuery() {
  const el = document.getElementById("modelSearch");
  return el ? el.value.trim().toLowerCase() : "";
}

// ════════════════════════════════════════════
//  COST CALCULATION
// ════════════════════════════════════════════

function calcCost(model, params) {
  const totalRequests = params.requestsPerDay * params.days;
  const inM  = (params.inputTokens  * totalRequests) / 1_000_000;
  const outM = (params.outputTokens * totalRequests) / 1_000_000;
  return inM * model.inputPrice + outM * model.outputPrice;
}

function calcDailyCost(model, params) {
  const inM  = (params.inputTokens  * params.requestsPerDay) / 1_000_000;
  const outM = (params.outputTokens * params.requestsPerDay) / 1_000_000;
  return inM * model.inputPrice + outM * model.outputPrice;
}

// ════════════════════════════════════════════
//  PRESETS
// ════════════════════════════════════════════

function applyPreset(key) {
  const p = PRESETS[key];
  document.getElementById("inputTokens").value    = p.inputTokens;
  document.getElementById("outputTokens").value   = p.outputTokens;
  document.getElementById("requestsPerDay").value = p.requestsPerDay;
  document.getElementById("days").value           = p.days;
  document.querySelectorAll(".preset-item").forEach(b => b.classList.remove("active"));
  event.currentTarget.classList.add("active");
  renderAll();
}

// ════════════════════════════════════════════
//  FILTER + SORT MODELS
// ════════════════════════════════════════════

function getFilteredModels() {
  const params    = getParams();
  const tiers     = getActiveTiers();
  const speeds    = getActiveSpeeds();
  const minCtx    = getMinCtx();
  const maxBudget = getMaxBudget();
  const sortBy    = getSortBy();
  const query     = getSearchQuery();

  let models = MODELS
    .filter(m => activeProviders.has(m.provider))
    .filter(m => tiers.includes(m.tier))
    .filter(m => speeds.includes(m.speed))
    .filter(m => m.contextWindow >= minCtx)
    .filter(m => {
      if (!query) return true;
      const p   = PROVIDERS[m.provider];
      const hay = [m.name, p.name, m.description, ...m.features, m.tier, m.speed]
        .join(" ").toLowerCase();
      return hay.includes(query);
    })
    .map(m => ({
      ...m,
      totalCost: calcCost(m, params),
      dailyCost: calcDailyCost(m, params),
    }))
    .filter(m => m.totalCost <= maxBudget);

  if (sortBy === "cost")     models.sort((a, b) => a.totalCost - b.totalCost);
  if (sortBy === "provider") models.sort((a, b) => a.provider.localeCompare(b.provider));
  if (sortBy === "context")  models.sort((a, b) => b.contextWindow - a.contextWindow);
  if (sortBy === "speed") {
    const order = ["Blazing Fast","Very Fast","Fast","Moderate","Slow"];
    models.sort((a, b) => order.indexOf(a.speed) - order.indexOf(b.speed));
  }

  return models;
}

// ════════════════════════════════════════════
//  RENDER ALL
// ════════════════════════════════════════════

function renderAll() {
  const params = getParams();
  const models = getFilteredModels();

  // Sidebar computed value
  const totalEl = document.getElementById("totalRequests");
  if (totalEl) totalEl.textContent = (params.requestsPerDay * params.days).toLocaleString();

  // Nav count
  const mcEl = document.getElementById("modelCount");
  if (mcEl) mcEl.textContent = models.length;

  // Toolbar count
  const rcEl = document.getElementById("resultCount");
  if (rcEl) rcEl.textContent = `${models.length} model${models.length !== 1 ? "s" : ""} found`;

  renderResults(models, params);
  if (activeMainTab === "chart")    renderChart(models);
  if (activeMainTab === "bestpick") renderBestPick(models);
}

// ════════════════════════════════════════════
//  RESULTS GRID / LIST
// ════════════════════════════════════════════

function renderResults(models, params) {
  const grid = document.getElementById("resultsGrid");
  if (!grid) return;

  if (!models.length) {
    grid.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">🔍</span>
        <p>No models match your filters.</p>
        <button onclick="resetFilters()">Reset Filters</button>
      </div>`;
    return;
  }

  // params may be passed or resolved here
  if (!params) params = getParams();

  const maxCost = Math.max(...models.map(m => m.totalCost), 0.01);
  const minCost = Math.min(...models.map(m => m.totalCost));

  grid.innerHTML = models.map((m, i) => {
    const p      = PROVIDERS[m.provider];
    const isBest = m.totalCost === minCost;
    const pct    = (m.totalCost / maxCost) * 100;
    const rank   = i + 1;

    if (currentView === "list") {
      return `
      <div class="list-row ${isBest ? "best" : ""}" style="--accent:${p.color}">
        <div class="list-rank">#${rank}</div>
        <div class="list-provider" style="color:${p.color}">${p.logo}</div>
        <div class="list-model">
          <div class="lm-name">${m.name}</div>
          <div class="lm-provider">${p.name}</div>
        </div>
        <div class="list-tier"><span class="card-tier tier-${m.tier}">${m.tier}</span></div>
        <div class="list-speed">${m.speed}</div>
        <div class="list-ctx">${fmtCtx(m.contextWindow)}</div>
        <div class="list-input">
          ${fmtPrice(m.inputPrice)}<span class="inr-sub">/1M</span>
        </div>
        <div class="list-output">
          ${fmtPrice(m.outputPrice)}<span class="inr-sub">/1M</span>
        </div>
        <div class="list-total" style="color:${p.color}">
          ${fmt(m.totalCost)}
          <span class="inr-sub">${fmtSecondary(m.totalCost)}</span>
        </div>
        ${isBest ? '<div class="list-badge">🏆</div>' : '<div class="list-badge"></div>'}
      </div>`;
    }

    // Grid card
    return `
    <div class="result-card ${isBest ? "best" : ""}" style="--accent:${p.color}">
      <div class="card-top-bar" style="background:${p.color}"></div>
      ${isBest
        ? '<div class="best-label">🏆 Best Value</div>'
        : `<div class="rank-badge">#${rank}</div>`}

      <div class="card-header">
        <div>
          <div class="card-provider" style="color:${p.color}">${p.logo} ${p.name}</div>
          <div class="card-model">${m.name}</div>
        </div>
        <div class="card-tier tier-${m.tier}">${m.tier}</div>
      </div>

      <div class="card-desc">${m.description}</div>

      <div class="card-specs">
        <span class="spec-tag">⚡ ${m.speed}</span>
        <span class="spec-tag">🗂 ${fmtCtx(m.contextWindow)}</span>
      </div>

      <div class="features-row">
        ${m.features.slice(0, 3).map(f => `<span class="feature-chip">${f}</span>`).join("")}
      </div>

      <div class="pricing-row">
        <div class="price-item">
          <span class="price-label">Input /1M</span>
          <span class="price-value">${fmtPrice(m.inputPrice)}</span>
          <span class="price-inr">${fmtSecondary(m.inputPrice)}</span>
        </div>
        <div class="price-item">
          <span class="price-label">Output /1M</span>
          <span class="price-value">${fmtPrice(m.outputPrice)}</span>
          <span class="price-inr">${fmtSecondary(m.outputPrice)}</span>
        </div>
        <div class="price-item">
          <span class="price-label">Daily</span>
          <span class="price-value">${fmt(m.dailyCost)}</span>
          <span class="price-inr">${fmtSecondary(m.dailyCost)}</span>
        </div>
      </div>

      <div class="total-cost">
        <div class="total-label">
          <span class="total-label-main">Total (${params.days}d)</span>
          <span class="total-label-sub">${(params.requestsPerDay * params.days).toLocaleString()} reqs</span>
        </div>
        <div class="total-value">
          <span class="total-usd" style="color:${p.color}">${fmt(m.totalCost)}</span>
          <span class="total-inr">${fmtSecondary(m.totalCost)}</span>
        </div>
      </div>

      <div class="cost-bar-wrap">
        <div class="cost-bar" style="width:${pct.toFixed(1)}%;background:${p.color}"></div>
      </div>
    </div>`;
  }).join("");
}

// ════════════════════════════════════════════
//  CHART
// ════════════════════════════════════════════

function renderChart(models) {
  const container = document.getElementById("chartBars");
  if (!container) return;
  const top = models.slice(0, 12);
  if (!top.length) { container.innerHTML = `<p class="empty-msg">No data</p>`; return; }

  const maxCost = Math.max(...top.map(m => m.totalCost), 0.01);

  container.innerHTML = top.map((m, i) => {
    const p   = PROVIDERS[m.provider];
    const pct = (m.totalCost / maxCost) * 100;
    return `
    <div class="bar-row">
      <div class="bar-rank">${i + 1}</div>
      <div class="bar-label">${p.logo} <strong>${m.name}</strong>
        <span style="color:${p.color};font-size:0.72rem"> ${p.name}</span>
      </div>
      <div class="bar-track">
        <div class="bar-fill" style="width:${pct.toFixed(1)}%;background:${p.color}">
          <span class="bar-value">${fmt(m.totalCost)}</span>
        </div>
      </div>
    </div>`;
  }).join("");
}

// ════════════════════════════════════════════
//  BEST PICK TAB
// ════════════════════════════════════════════

function renderBestPick(models) {
  const grid = document.getElementById("bestpickGrid");
  if (!grid) return;
  if (!models) models = getFilteredModels();
  if (!models.length) {
    grid.innerHTML = `<p class="empty-msg">No models match your filters.</p>`;
    return;
  }

  const cheapest  = [...models].sort((a, b) => a.totalCost - b.totalCost)[0];
  const bestCtx   = [...models].sort((a, b) => b.contextWindow - a.contextWindow)[0];
  const fastest   = [...models].sort((a, b) => {
    const order = ["Blazing Fast","Very Fast","Fast","Moderate","Slow"];
    return order.indexOf(a.speed) - order.indexOf(b.speed);
  })[0];
  const bestValue = [...models].sort((a, b) => {
    const sA = a.contextWindow / (a.totalCost || 0.0001);
    const sB = b.contextWindow / (b.totalCost || 0.0001);
    return sB - sA;
  })[0];

  const cards = [
    { icon: "💰", label: "Cheapest Option",   model: cheapest,  extra: fmt(cheapest.totalCost) + " total · " + fmtSecondary(cheapest.totalCost) },
    { icon: "🧠", label: "Most Context",       model: bestCtx,   extra: fmtCtx(bestCtx.contextWindow) + " context window" },
    { icon: "🚀", label: "Fastest Speed",      model: fastest,   extra: fastest.speed },
    { icon: "⚖️", label: "Best Value (ctx/$)", model: bestValue, extra: fmt(bestValue.totalCost) + " · " + fmtCtx(bestValue.contextWindow) },
  ];

  grid.innerHTML = cards.map(c => {
    const p = PROVIDERS[c.model.provider];
    return `
    <div class="bestpick-card" style="--accent:${p.color}">
      <div class="bp-icon">${c.icon}</div>
      <div class="bp-label">${c.label}</div>
      <div class="bp-model" style="color:${p.color}">${p.logo} ${c.model.name}</div>
      <div class="bp-provider">${p.name}</div>
      <div class="bp-extra">${c.extra}</div>
      <div class="bp-pricing">
        <span>In: ${fmtPrice(c.model.inputPrice)}/1M</span>
        <span>Out: ${fmtPrice(c.model.outputPrice)}/1M</span>
        <span style="color:var(--text-dim)">
          ${useINR
            ? fmtUSD(c.model.inputPrice) + " / " + fmtUSD(c.model.outputPrice) + " USD"
            : "₹" + (c.model.inputPrice * USD_TO_INR).toFixed(1) + " / ₹" + (c.model.outputPrice * USD_TO_INR).toFixed(1) + " INR"}
        </span>
      </div>
      <div class="bp-features">
        ${c.model.features.slice(0, 4).map(f => `<span class="feature-chip">${f}</span>`).join("")}
      </div>
    </div>`;
  }).join("");

  // Provider breakdown
  const byProvider = {};
  models.forEach(m => {
    if (!byProvider[m.provider]) byProvider[m.provider] = { count: 0, minCost: Infinity };
    byProvider[m.provider].count++;
    if (m.totalCost < byProvider[m.provider].minCost) byProvider[m.provider].minCost = m.totalCost;
  });

  const provCards = Object.entries(byProvider).map(([key, data]) => {
    const p = PROVIDERS[key];
    return `
    <div class="provider-summary-card" style="--accent:${p.color}">
      <div class="ps-logo" style="color:${p.color}">${p.logo}</div>
      <div class="ps-name">${p.name}</div>
      <div class="ps-count">${data.count} model${data.count > 1 ? "s" : ""}</div>
      <div class="ps-min">From ${fmt(data.minCost)}</div>
    </div>`;
  }).join("");

  grid.innerHTML += `
    <div class="bestpick-divider">Provider Summary</div>
    <div class="provider-summary-row">${provCards}</div>`;
}

// ════════════════════════════════════════════
//  SPECS TABLE
// ════════════════════════════════════════════

function buildSpecsTable() {
  const table = document.getElementById("specsTable");
  if (!table) return;
  table.innerHTML = `
    <thead>
      <tr>
        <th>Provider</th>
        <th>Model</th>
        <th>Tier</th>
        <th>Input USD/1M</th>
        <th>Input ₹/1M</th>
        <th>Output USD/1M</th>
        <th>Output ₹/1M</th>
        <th>Context</th>
        <th>Speed</th>
        <th>Features</th>
      </tr>
    </thead>
    <tbody id="specsBody">
      ${MODELS.map(m => {
        const p = PROVIDERS[m.provider];
        const searchStr = [m.name, p.name, ...m.features].join(" ").toLowerCase();
        return `<tr data-search="${searchStr}">
          <td><span style="color:${p.color}">${p.logo} ${p.name}</span></td>
          <td><strong>${m.name}</strong></td>
          <td><span class="card-tier tier-${m.tier}">${m.tier}</span></td>
          <td class="num">$${m.inputPrice.toFixed(3)}</td>
          <td class="num">₹${(m.inputPrice * USD_TO_INR).toFixed(1)}</td>
          <td class="num">$${m.outputPrice.toFixed(3)}</td>
          <td class="num">₹${(m.outputPrice * USD_TO_INR).toFixed(1)}</td>
          <td class="num">${fmtCtx(m.contextWindow)}</td>
          <td>${m.speed}</td>
          <td class="feat-cell">${m.features.map(f => `<span class="feature-chip">${f}</span>`).join("")}</td>
        </tr>`;
      }).join("")}
    </tbody>`;
}

function filterSpecsTable() {
  const q = document.getElementById("specsSearch").value.toLowerCase();
  document.querySelectorAll("#specsBody tr").forEach(row => {
    row.style.display = row.dataset.search.includes(q) ? "" : "none";
  });
}

// ════════════════════════════════════════════
//  SEARCH
// ════════════════════════════════════════════

function clearSearch() {
  const el = document.getElementById("modelSearch");
  if (el) { el.value = ""; el.focus(); }
  document.getElementById("searchClear")?.classList.remove("visible");
  renderAll();
}

// ════════════════════════════════════════════
//  RESET ALL FILTERS
// ════════════════════════════════════════════

function resetFilters() {
  selectAllProviders();
  document.querySelectorAll("#tierFilter input, #speedFilter input").forEach(cb => cb.checked = true);
  const sortCost = document.querySelector("input[name='sortBy'][value='cost']");
  if (sortCost) sortCost.checked = true;
  const ctxAny  = document.querySelector("input[name='minCtx'][value='0']");
  if (ctxAny)   ctxAny.checked = true;
  const budget  = document.getElementById("maxBudget");
  if (budget)   budget.value = "";
  const search  = document.getElementById("modelSearch");
  if (search)   search.value = "";
  document.getElementById("searchClear")?.classList.remove("visible");
  renderAll();
}

// ════════════════════════════════════════════
//  CURRENCY TOGGLE
// ════════════════════════════════════════════

function toggleCurrency() {
  useINR = !useINR;
  document.getElementById("currencyToggle").classList.toggle("inr", useINR);
  renderAll();
}

// ════════════════════════════════════════════
//  VIEW TOGGLE
// ════════════════════════════════════════════

function setView(v) {
  currentView = v;
  const grid = document.getElementById("resultsGrid");
  if (grid) grid.className = v === "list" ? "results-list" : "results-grid";
  document.getElementById("viewGrid")?.classList.toggle("active", v === "grid");
  document.getElementById("viewList")?.classList.toggle("active", v === "list");
  renderResults(getFilteredModels(), getParams());
}

// ════════════════════════════════════════════
//  FORMAT HELPERS
// ════════════════════════════════════════════

function fmt(usd) {
  if (useINR) return fmtINR(usd * USD_TO_INR);
  if (usd < 0.001)  return `$${usd.toFixed(6)}`;
  if (usd < 0.01)   return `$${usd.toFixed(5)}`;
  if (usd < 1)      return `$${usd.toFixed(4)}`;
  if (usd < 10000)  return `$${usd.toFixed(2)}`;
  return `$${usd.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function fmtUSD(usd) {
  if (usd < 0.001) return `$${usd.toFixed(6)}`;
  if (usd < 0.01)  return `$${usd.toFixed(5)}`;
  if (usd < 1)     return `$${usd.toFixed(4)}`;
  if (usd < 10000) return `$${usd.toFixed(2)}`;
  return `$${usd.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function fmtINR(inr) {
  if (inr < 0.1)      return `₹${inr.toFixed(4)}`;
  if (inr < 1)        return `₹${inr.toFixed(3)}`;
  if (inr < 100)      return `₹${inr.toFixed(2)}`;
  if (inr < 100000)   return `₹${inr.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
  if (inr < 10000000) return `₹${(inr / 100000).toFixed(2)}L`;
  return `₹${(inr / 10000000).toFixed(2)}Cr`;
}

function fmtPrice(usdPer1M) {
  if (useINR) return `₹${(usdPer1M * USD_TO_INR).toFixed(1)}`;
  return `$${usdPer1M.toFixed(3)}`;
}

function fmtSecondary(usd) {
  if (useINR) return fmtUSD(usd);
  return `₹${(usd * USD_TO_INR).toFixed(0)}`;
}

function fmtCtx(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`;
  return `${n}`;
}
