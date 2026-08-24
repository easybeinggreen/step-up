import { renderHome } from './screens/home.js';
import { renderSession } from './screens/session.js';
import { renderReview } from './screens/review.js';
import { renderMetrics } from './screens/metrics.js';
import { renderSettings } from './screens/settings.js';

const app = document.getElementById('app');

function tabbar(active) {
  const tabs = [
    { id: 'home', href: '#/', label: 'Today' },
    { id: 'review', href: '#/review', label: 'Review' },
    { id: 'metrics', href: '#/metrics', label: 'Body' },
    { id: 'settings', href: '#/settings', label: 'Settings' },
  ];
  return `<nav class="tabbar">${tabs
    .map((t) => `<a href="${t.href}" class="${t.id === active ? 'active' : ''}">${t.label}</a>`)
    .join('')}</nav>`;
}

async function route() {
  const hash = location.hash || '#/';
  const [, path, a, b, c] = hash.split('/');

  let nav = 'home';
  const content = document.createElement('div');

  // content must be attached to the live document before render functions
  // run, since they query their own markup via document.getElementById.
  app.innerHTML = '';
  app.appendChild(content);

  if (!path || path === '') {
    nav = 'home';
    await renderHome(content);
  } else if (path === 'session' && a && b) {
    nav = 'home';
    await renderSession(content, { sessionId: a, routineId: b, planDayId: c || null });
  } else if (path === 'review') {
    nav = 'review';
    await renderReview(content);
  } else if (path === 'metrics') {
    nav = 'metrics';
    await renderMetrics(content);
  } else if (path === 'settings') {
    nav = 'settings';
    await renderSettings(content);
  } else {
    content.innerHTML = `<h1>Not found</h1>`;
  }

  app.insertAdjacentHTML('beforeend', tabbar(nav));
}

window.addEventListener('hashchange', route);
route();
