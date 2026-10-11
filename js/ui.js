import { t, L, dateFmt } from './i18n.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function regimeBadge(regime) {
  return `<span class="badge ${esc(regime)}">${esc(t(`regime.${regime}`))}</span>`;
}

export function confBadge(conf) {
  if (!conf || conf === 'high') return '';
  return `<span class="badge ${conf === 'low' ? 'warn' : ''}" title="${esc(t('conf.tip'))}">${esc(t(`conf.${conf}`))}</span>`;
}

// Source line shown under any figure in Analyst mode.
export function sourceNote(rec) {
  if (!rec) return '';
  const link = rec.source_url ? `<a href="${esc(rec.source_url)}" target="_blank" rel="noopener">${esc(rec.source)}</a>` : esc(rec.source || '—');
  return `<div class="analyst-only small muted">${t('src.label')}: ${link} · ${t('src.asof')} ${dateFmt(rec.as_of)} ${confBadge(rec.confidence)}</div>`;
}

export function calcPanel(title, bodyHtml) {
  return `<div class="analyst-only calc-panel"><h4>${esc(title)}</h4>${bodyHtml}</div>`;
}

export function tableView(headers, rows) {
  return `<details class="tableview"><summary>${t('chart.table')}</summary><div class="table-wrap"><table>
    <thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`;
}

export function css(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

const charts = new Set();
export function destroyCharts() { charts.forEach((c) => c.destroy()); charts.clear(); }

// Single-axis Chart.js with Taameer styling; thin bars, rounded data-ends, hover tooltips.
export function chart(canvas, { type = 'bar', labels, datasets, yFormat = (v) => v, stacked = false }) {
  const ink2 = css('--ink-2'), line = css('--line');
  const c = new Chart(canvas, {
    type,
    data: {
      labels,
      datasets: datasets.map((d, i) => ({
        borderWidth: type === 'line' ? 2 : 0,
        borderRadius: type === 'bar' ? 4 : 0,
        maxBarThickness: 28,
        pointRadius: 0,
        pointHoverRadius: 5,
        tension: 0.25,
        backgroundColor: d.color || css(`--series-${i + 1}`),
        borderColor: d.color || css(`--series-${i + 1}`),
        ...d,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: datasets.length > 1, labels: { color: ink2, boxWidth: 10, boxHeight: 10 } },
        tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${yFormat(ctx.parsed.y)}` } },
      },
      scales: {
        x: { stacked, grid: { display: false }, ticks: { color: ink2, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 }, border: { color: line } },
        y: { stacked, beginAtZero: type === 'bar', grid: { color: line }, ticks: { color: ink2, callback: yFormat }, border: { display: false } },
      },
    },
  });
  charts.add(c);
  return c;
}

let maps = [];
export function destroyMaps() { maps.forEach((m) => m.remove()); maps = []; }

export function makeMap(el, center = [25.32, 51.5], zoom = 11) {
  const m = L_.map(el, { scrollWheelZoom: false }).setView(center, zoom);
  L_.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors', maxZoom: 19,
  }).addTo(m);
  maps.push(m);
  return m;
}
// Leaflet's global is `L`, which clashes with our L() helper name in modules.
const L_ = window.L;
export { L_ as Leaflet };

export function nameOf(rec) { return esc(L(rec)); }
