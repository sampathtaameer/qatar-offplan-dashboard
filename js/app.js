import { loadData } from './data.js';
import { initI18n, setLang, getLang, t, store, dateFmt } from './i18n.js';
import { destroyCharts, destroyMaps, esc } from './ui.js';
import { renderOverview } from './views/overview.js';
import { renderAreas, renderArea } from './views/areas.js';
import { renderProjects, renderProject } from './views/projects.js';
import { renderCompare } from './views/compare.js';
import { renderResidency } from './views/residency.js';

const routes = [
  [/^#\/overview$/, renderOverview, 'overview'],
  [/^#\/areas$/, renderAreas, 'areas'],
  [/^#\/area\/([\w-]+)$/, renderArea, 'areas'],
  [/^#\/projects$/, renderProjects, 'projects'],
  [/^#\/project\/([\w-]+)$/, renderProject, 'projects'],
  [/^#\/compare(?:\?(.*))?$/, renderCompare, 'compare'],
  [/^#\/residency(?:\?(.*))?$/, renderResidency, 'residency'],
];

let data;
const view = document.getElementById('view');

async function render() {
  const hash = location.hash || '#/overview';
  const match = routes.find(([re]) => re.test(hash));
  if (!match) { location.hash = '#/overview'; return; }
  const [re, fn, nav] = match;
  const params = hash.match(re).slice(1);
  destroyCharts();
  destroyMaps();
  document.querySelectorAll('.mainnav a').forEach((a) => a.classList.toggle('active', a.getAttribute('href') === `#/${nav}`));
  try {
    await fn(view, data, ...params);
  } catch (err) {
    console.error(err);
    view.innerHTML = `<div class="card empty">${esc(t('error.render'))}<br><code>${esc(err.message)}</code></div>`;
  }
  renderFreshness();
}

function renderFreshness() {
  const m = data.meta;
  const stale = Object.entries(m).filter(([, v]) => v.stale).map(([k]) => t(`file.${k}`));
  document.getElementById('freshness').innerHTML =
    `${t('footer.updated')} ${dateFmt(m.transactions.as_of)}` +
    (stale.length ? ` · <span class="conf-low">${esc(t('footer.stale'))}: ${esc(stale.join(', '))}</span>` : '');
}

function initToggles() {
  const langBtn = document.getElementById('langToggle');
  const syncLangBtn = () => { langBtn.textContent = getLang() === 'ar' ? 'English' : 'عربي'; };
  syncLangBtn();
  langBtn.addEventListener('click', () => { setLang(getLang() === 'ar' ? 'en' : 'ar'); syncLangBtn(); render(); });

  const analyst = document.getElementById('analystToggle');
  let on = false;
  try { on = localStorage.getItem('analyst') === '1'; } catch { /* ignore */ }
  analyst.checked = on;
  document.body.classList.toggle('analyst', on);
  analyst.addEventListener('change', () => {
    document.body.classList.toggle('analyst', analyst.checked);
    store('analyst', analyst.checked ? '1' : '0');
  });
}

async function boot() {
  try {
    await initI18n();
    data = await loadData();
  } catch (err) {
    view.innerHTML = `<div class="card empty">Could not load data. Serve this folder over HTTP (not file://).<br><code>${esc(err.message)}</code></div>`;
    return;
  }
  initToggles();
  window.addEventListener('hashchange', render);
  render();
}

boot();
