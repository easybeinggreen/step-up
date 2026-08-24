import { getRoutines, startSession, updatePlanDay, addConstraint, SYNC_CONFIGURED } from '../db.js';
import { ensureTodayPlan } from '../plan.js';
import { VOICE_INPUT_SUPPORTED, listenOnce, parseCommand } from '../voice.js';
import { getCurrentTemperatureC } from '../weather.js';

export async function renderHome(root) {
  root.innerHTML = `<h1>Step Up</h1><p class="dim">What are we doing today?</p><div id="today-body">Loading…</div>`;

  if (!SYNC_CONFIGURED) {
    document.getElementById('today-body').innerHTML =
      `<div class="card"><strong>Supabase not configured.</strong><p class="dim">Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env</p></div>`;
    return;
  }

  const body = document.getElementById('today-body');

  try {
    const routines = await getRoutines();
    let planDay = await ensureTodayPlan(routines);
    renderTodayCard(body, planDay, routines);
  } catch (err) {
    body.innerHTML = `<div class="card"><strong>Couldn't load today's plan.</strong><p class="dim">${err.message}</p></div>`;
  }

  function renderTodayCard(container, planDay, routines) {
    const routine = planDay?.routines ?? null;

    if (planDay.status === 'skipped' || planDay.status === 'rest' || !routine) {
      container.innerHTML = `
        <div class="card">
          <span class="pill">${planDay.status === 'rest' ? 'Rest day' : 'Skipped'}</span>
          <p class="dim">${planDay.note ?? "Today's marked as a rest day."}</p>
          <button id="undo-skip">Actually, let's train</button>
        </div>
        ${otherRoutinesPicker(routines)}
        ${constraintForm()}
      `;
      document.getElementById('undo-skip').addEventListener('click', async () => {
        const updated = await updatePlanDay(planDay.id, { routine_id: routines[0]?.id ?? null, status: 'planned', note: null });
        planDay = updated;
        renderTodayCard(container, planDay, routines);
      });
    } else {
      container.innerHTML = `
        <div class="card">
          <span class="pill">${routine.category}</span>
          <h2 style="margin-top:8px">${routine.name}</h2>
          <button class="primary" id="start-btn">Start</button>
          <button id="skip-btn">Skip today</button>
        </div>
        ${VOICE_INPUT_SUPPORTED ? `<div class="card"><button id="voice-btn">🎙 "start", "skip today", "something different"</button><p class="dim" id="voice-status"></p></div>` : ''}
        ${otherRoutinesPicker(routines, routine.id)}
        ${constraintForm()}
      `;

      document.getElementById('start-btn').addEventListener('click', async (e) => {
        e.target.disabled = true;
        e.target.textContent = 'Starting…';
        const temperatureC = await getCurrentTemperatureC();
        const session = await startSession(planDay.id, temperatureC);
        location.hash = `#/session/${session.id}/${routine.id}/${planDay.id}`;
      });

      document.getElementById('skip-btn').addEventListener('click', async () => {
        const updated = await updatePlanDay(planDay.id, { status: 'skipped', note: 'Skipped from home screen' });
        planDay = updated;
        renderTodayCard(container, planDay, routines);
      });

      const voiceBtn = document.getElementById('voice-btn');
      voiceBtn?.addEventListener('click', async () => {
        const statusEl = document.getElementById('voice-status');
        statusEl.textContent = 'Listening…';
        try {
          const transcript = await listenOnce();
          const cmd = parseCommand(transcript);
          statusEl.textContent = `Heard: "${transcript}"`;
          if (cmd.type === 'start') {
            document.getElementById('start-btn').click();
          } else if (cmd.type === 'skip_today') {
            document.getElementById('skip-btn').click();
          }
        } catch (err) {
          statusEl.textContent = `Didn't catch that (${err.message}).`;
        }
      });
    }

    container.querySelectorAll('button[data-routine]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const updated = await updatePlanDay(planDay.id, { routine_id: btn.dataset.routine, status: 'planned', note: null });
        planDay = updated;
        renderTodayCard(container, planDay, routines);
      });
    });

    const cForm = container.querySelector('#constraint-form');
    cForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const category = cForm.querySelector('[name=category]').value || null;
      const note = cForm.querySelector('[name=note]').value || null;
      const days = Number(cForm.querySelector('[name=days]').value) || 7;
      const startsOn = new Date().toISOString().slice(0, 10);
      const endsOn = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
      await addConstraint({ startsOn, endsOn, category, note });
      cForm.closest('.card').innerHTML = `<p class="dim">Got it — avoiding ${category || 'that'} for ${days} days.</p>`;
    });
  }

  function otherRoutinesPicker(routines, currentId) {
    const others = routines.filter((r) => r.id !== currentId);
    if (!others.length) return '';
    return `<div class="card">
      <span class="dim">Something else instead?</span>
      ${others.map((r) => `<button data-routine="${r.id}" style="margin-top:8px">${r.name}</button>`).join(' ')}
    </div>`;
  }

  function constraintForm() {
    return `<div class="card">
      <span class="dim">Injury or unavailable? Tell the planner.</span>
      <form id="constraint-form" style="margin-top:8px;display:flex;flex-direction:column;gap:8px">
        <input name="note" placeholder="e.g. right leg niggly" />
        <div style="display:flex;gap:8px">
          <select name="category" style="flex:1">
            <option value="">Any category</option>
            <option value="Lower Body">Lower Body (glutes/calves)</option>
            <option value="Upper Body">Upper Body (arms/chest/abs)</option>
          </select>
          <input name="days" type="number" placeholder="days" value="7" style="width:70px" />
        </div>
        <button type="submit">Avoid it</button>
      </form>
    </div>`;
  }
}
