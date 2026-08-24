import { addBodyMetric, getBodyMetrics } from '../db.js';

export async function renderMetrics(root) {
  root.innerHTML = `<h1>Body Metrics</h1><div id="metrics-body">Loading…</div>`;
  const body = document.getElementById('metrics-body');

  try {
    await refresh();
  } catch (err) {
    body.innerHTML = `<div class="card"><strong>Couldn't load metrics.</strong><p class="dim">${err.message}</p></div>`;
  }

  async function refresh() {
    const entries = await getBodyMetrics(12);
    body.innerHTML = `
      <div class="card">
        <form id="metric-form" style="display:flex;flex-direction:column;gap:8px">
          <label class="dim">Date
            <input name="date" type="date" value="${new Date().toISOString().slice(0, 10)}" />
          </label>
          <label class="dim">Weight (kg)
            <input name="weight" type="number" step="0.1" />
          </label>
          <div style="display:flex;gap:8px">
            <label class="dim" style="flex:1">Waist (cm)<input name="waist" type="number" step="0.1" /></label>
            <label class="dim" style="flex:1">Chest (cm)<input name="chest" type="number" step="0.1" /></label>
            <label class="dim" style="flex:1">Hips (cm)<input name="hips" type="number" step="0.1" /></label>
          </div>
          <button type="submit" class="primary">Save</button>
        </form>
      </div>
      <h2>History</h2>
      ${
        entries.length
          ? entries
              .map(
                (e) => `
        <div class="card">
          <div class="exercise-row">
            <span>${e.date}</span>
            <span>${e.weight_kg ? `${e.weight_kg}kg` : ''}</span>
          </div>
          ${
            e.measurements
              ? `<p class="dim">${Object.entries(e.measurements)
                  .filter(([, v]) => v != null && v !== '')
                  .map(([k, v]) => `${k}: ${v}cm`)
                  .join(' · ')}</p>`
              : ''
          }
        </div>`
              )
              .join('')
          : `<div class="card dim">No entries yet.</div>`
      }
    `;

    document.getElementById('metric-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      const date = form.date.value;
      const weight = form.weight.value ? Number(form.weight.value) : null;
      const measurements = {
        waist: form.waist.value || null,
        chest: form.chest.value || null,
        hips: form.hips.value || null,
      };
      await addBodyMetric({ date, weightKg: weight, measurements });
      await refresh();
    });
  }
}
