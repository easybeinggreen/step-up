import { getRecentSessions, getWeekSets } from '../db.js';

export async function renderReview(root) {
  root.innerHTML = `<h1>Weekly Review</h1><div id="review-body">Loading…</div>`;
  const body = document.getElementById('review-body');

  try {
    const [sessions, weekSets] = await Promise.all([getRecentSessions(10), getWeekSets()]);

    const finished = sessions.filter((s) => s.finished_at);
    const thisWeekSessions = sessions.filter((s) => {
      const days = (Date.now() - new Date(s.started_at).getTime()) / 86400000;
      return days <= 7;
    });

    const byExercise = {};
    for (const s of weekSets) {
      const name = s.exercises?.name ?? 'Unknown';
      if (!byExercise[name]) byExercise[name] = { sets: 0, volume: 0, maxWeight: 0 };
      byExercise[name].sets += 1;
      if (s.reps && s.weight_kg) byExercise[name].volume += s.reps * s.weight_kg;
      if (s.weight_kg && s.weight_kg > byExercise[name].maxWeight) byExercise[name].maxWeight = s.weight_kg;
    }

    body.innerHTML = `
      <div class="card">
        <span class="pill">Last 7 days</span>
        <h2 style="margin-top:8px">${thisWeekSessions.length} session${thisWeekSessions.length === 1 ? '' : 's'}</h2>
      </div>
      <h2>By exercise this week</h2>
      ${
        Object.keys(byExercise).length
          ? Object.entries(byExercise)
              .map(
                ([name, v]) => `
        <div class="card">
          <div class="exercise-row">
            <strong>${name}</strong>
            <span class="pill">${v.sets} sets</span>
          </div>
          ${v.maxWeight ? `<p class="dim">Top weight: ${v.maxWeight}kg · Volume: ${Math.round(v.volume)}kg·reps</p>` : ''}
        </div>`
              )
              .join('')
          : `<div class="card dim">Nothing logged yet this week.</div>`
      }
      <h2>Recent sessions</h2>
      ${
        finished.length
          ? finished
              .map(
                (s) => `
        <div class="card">
          <div class="exercise-row">
            <span>${new Date(s.started_at).toLocaleDateString()}</span>
            <span class="dim">${s.temperature_c ? `${s.temperature_c}°C` : ''}</span>
          </div>
          ${s.overall_note ? `<p class="dim">"${s.overall_note}"</p>` : ''}
        </div>`
              )
              .join('')
          : `<div class="card dim">No finished sessions yet.</div>`
      }
    `;
  } catch (err) {
    body.innerHTML = `<div class="card"><strong>Couldn't load review.</strong><p class="dim">${err.message}</p></div>`;
  }
}
