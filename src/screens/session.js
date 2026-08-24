import {
  getRoutineWithExercises,
  logSet,
  getSessionSets,
  finishSession,
  updateRoutineExerciseWeight,
  updatePlanDay,
} from '../db.js';
import {
  VOICE_INPUT_SUPPORTED,
  VOICE_OUTPUT_SUPPORTED,
  speak,
  stopSpeaking,
  countReps,
  countHold,
  listenOnce,
  parseCommand,
} from '../voice.js';

const REST_SECONDS = 15;

export async function renderSession(root, { sessionId, routineId, planDayId }) {
  root.innerHTML = `<h1>Workout</h1><div id="session-body">Loading…</div>`;
  const body = document.getElementById('session-body');

  let stopFlag = false;
  let coaching = false;

  try {
    const [exercises, existingSets] = await Promise.all([
      getRoutineWithExercises(routineId),
      getSessionSets(sessionId),
    ]);

    const loggedSets = existingSets; // grows in place as we log more

    body.innerHTML = `
      <div class="card">
        <div class="exercise-row">
          <button id="voice-cmd-btn" ${VOICE_INPUT_SUPPORTED ? '' : 'disabled'}>🎙 Voice command</button>
          <button id="coach-btn" class="primary" ${VOICE_OUTPUT_SUPPORTED ? '' : 'disabled'}>🔊 Guided workout</button>
        </div>
        <p class="dim" id="voice-status">${
          VOICE_INPUT_SUPPORTED
            ? `Say "start" for a guided workout, "finish" when you're done, or use a card's 🎙 to change weight.`
            : `Voice isn't supported in this browser — use the buttons below.`
        }</p>
      </div>
      <div id="exercise-list"></div>
      <button class="primary" id="finish-btn" style="width:100%;margin-top:10px">Finish workout</button>
    `;

    const list = document.getElementById('exercise-list');
    list.innerHTML = exercises
      .map((re) => {
        const ex = re.exercises;
        return `
        <div class="card" data-re-id="${re.id}" data-ex-id="${ex.id}">
          <div class="exercise-row">
            <div>
              <strong>${ex.name}</strong>${ex.description ? ` <span class="dim">— ${ex.description}</span>` : ''}<br/>
              <span class="dim">${re.target_sets} sets · ${
          ex.is_timed
            ? `${re.target_duration_seconds ?? 30}s hold`
            : `${re.target_reps ?? 10} reps${re.target_weight_kg ? ` @ ${re.target_weight_kg}kg` : ''}`
        }</span>
            </div>
            <span class="pill set-count">0/${re.target_sets} sets</span>
          </div>
          <div class="set-input">
            ${
              ex.is_timed
                ? `<label>Seconds<input type="number" class="input-duration" placeholder="${re.target_duration_seconds ?? 30}" /></label>`
                : `<label>Reps<input type="number" class="input-reps" placeholder="${re.target_reps ?? 10}" /></label>
                   <label>Weight kg<input type="number" step="0.5" class="input-weight" value="${re.target_weight_kg ?? ''}" /></label>`
            }
            <button class="log-set" style="align-self:flex-end">Log set</button>
            ${!ex.is_timed && VOICE_INPUT_SUPPORTED ? `<button class="mic-weight" style="align-self:flex-end" title="Say a new weight">🎙</button>` : ''}
          </div>
          <ul class="set-log-list"></ul>
        </div>`;
      })
      .join('');

    // Fill in sets already logged (e.g. re-opening a session).
    for (const re of exercises) {
      const card = list.querySelector(`[data-re-id="${re.id}"]`);
      renderSetLog(card, re, loggedSets.filter((s) => s.exercise_id === re.exercises.id));
    }

    function renderSetLog(card, re, sets) {
      const listEl = card.querySelector('.set-log-list');
      listEl.innerHTML = sets
        .map((s, i) =>
          re.exercises.is_timed
            ? `<li>Set ${i + 1}: ${s.duration_seconds ?? '-'}s</li>`
            : `<li>Set ${i + 1}: ${s.reps ?? '-'} reps${s.weight_kg ? ` @ ${s.weight_kg}kg` : ''}</li>`
        )
        .join('');
      card.querySelector('.set-count').textContent = `${sets.length}/${re.target_sets} sets`;
    }

    async function performLogSet(re, card, values) {
      const nextIndex = loggedSets.filter((s) => s.exercise_id === re.exercises.id).length + 1;
      await logSet(sessionId, re.exercises.id, nextIndex, values);
      loggedSets.push({
        exercise_id: re.exercises.id,
        reps: values.reps ?? null,
        duration_seconds: values.durationSeconds ?? null,
        weight_kg: values.weightKg ?? null,
      });
      renderSetLog(card, re, loggedSets.filter((s) => s.exercise_id === re.exercises.id));
      if (!re.exercises.is_timed && values.weightKg != null) {
        await updateRoutineExerciseWeight(re.id, values.weightKg);
        re.target_weight_kg = values.weightKg;
      }
    }

    // Manual tap-to-log controls (always available, voice or not).
    list.querySelectorAll('.log-set').forEach((btn) => {
      const card = btn.closest('.card');
      const re = exercises.find((r) => r.id === card.dataset.reId);
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          if (re.exercises.is_timed) {
            const duration = Number(card.querySelector('.input-duration').value) || re.target_duration_seconds || 30;
            await performLogSet(re, card, { durationSeconds: duration });
          } else {
            const reps = Number(card.querySelector('.input-reps').value) || re.target_reps || 10;
            const weightInput = card.querySelector('.input-weight');
            const weight = weightInput.value ? Number(weightInput.value) : null;
            await performLogSet(re, card, { reps, weightKg: weight });
          }
        } finally {
          btn.disabled = false;
        }
      });
    });

    // Per-card mic: "increase/decrease weight to N kilos" updates that exercise's weight.
    list.querySelectorAll('.mic-weight').forEach((btn) => {
      const card = btn.closest('.card');
      const re = exercises.find((r) => r.id === card.dataset.reId);
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        const statusEl = document.getElementById('voice-status');
        try {
          statusEl.textContent = 'Listening…';
          const transcript = await listenOnce();
          const cmd = parseCommand(transcript);
          if (cmd.type === 'set_weight') {
            card.querySelector('.input-weight').value = cmd.value;
            await updateRoutineExerciseWeight(re.id, cmd.value);
            re.target_weight_kg = cmd.value;
            statusEl.textContent = `Heard "${transcript}" → set ${re.exercises.name} to ${cmd.value}kg`;
            await speak(`${re.exercises.name} updated to ${cmd.value} kilos.`);
          } else {
            statusEl.textContent = `Heard "${transcript}" — didn't catch a weight, try "increase weight to five kilos".`;
          }
        } catch (err) {
          statusEl.textContent = `Didn't catch that (${err.message}).`;
        } finally {
          btn.disabled = false;
        }
      });
    });

    async function endSession(spokenNote) {
      const note = spokenNote ?? prompt('Anything to note about this workout? (optional)') ?? null;
      await finishSession(sessionId, note);
      if (planDayId) {
        await updatePlanDay(planDayId, { status: 'done' }).catch(() => {});
      }
      location.hash = '#/review';
    }

    async function runGuidedWorkout() {
      coaching = true;
      stopFlag = false;
      coachBtn.textContent = '⏸ Stop';
      try {
        await speak("Let's warm up for thirty seconds.");
        await countHold(30, { shouldStop: () => stopFlag });
        if (stopFlag) return;

        for (const re of exercises) {
          if (stopFlag) break;
          const card = list.querySelector(`[data-re-id="${re.id}"]`);
          const ex = re.exercises;
          const already = loggedSets.filter((s) => s.exercise_id === ex.id).length;
          const setsToDo = Math.max(0, re.target_sets - already);
          if (setsToDo === 0) continue;

          await speak(
            `${ex.name}. ${setsToDo} set${setsToDo === 1 ? '' : 's'} of ${
              ex.is_timed ? `${re.target_duration_seconds ?? 30} seconds` : `${re.target_reps ?? 10} reps`
            }.`
          );

          for (let i = 0; i < setsToDo; i++) {
            if (stopFlag) break;
            if (ex.is_timed) {
              await countHold(re.target_duration_seconds ?? 30, { shouldStop: () => stopFlag });
              if (!stopFlag) await performLogSet(re, card, { durationSeconds: re.target_duration_seconds ?? 30 });
            } else {
              await countReps(re.target_reps ?? 10, ex.default_seconds_per_rep ?? 2, { shouldStop: () => stopFlag });
              if (!stopFlag) await performLogSet(re, card, { reps: re.target_reps ?? 10, weightKg: re.target_weight_kg ?? null });
            }
            if (!stopFlag && i < setsToDo - 1) {
              await speak('Rest. Take a drink.');
              await new Promise((r) => setTimeout(r, REST_SECONDS * 1000));
            }
          }
        }

        if (!stopFlag) {
          await speak("Great work. Let's cool down for thirty seconds.");
          await countHold(30);
          await speak('Amazing job — workout complete! Say finish, or tap finish workout, whenever you\'re ready.');
        }
      } finally {
        coaching = false;
        stopFlag = false;
        coachBtn.textContent = '🔊 Guided workout';
      }
    }

    const coachBtn = document.getElementById('coach-btn');
    coachBtn.addEventListener('click', () => {
      if (coaching) {
        stopFlag = true;
        stopSpeaking();
      } else {
        runGuidedWorkout();
      }
    });

    document.getElementById('voice-cmd-btn').addEventListener('click', async () => {
      const statusEl = document.getElementById('voice-status');
      statusEl.textContent = 'Listening…';
      try {
        const transcript = await listenOnce();
        const cmd = parseCommand(transcript);
        statusEl.textContent = `Heard: "${transcript}"`;
        if (cmd.type === 'start' && !coaching) {
          runGuidedWorkout();
        } else if (cmd.type === 'finish') {
          await speak('Nice work today!');
          let note = null;
          try {
            statusEl.textContent = 'Say a note for this workout, or stay quiet to skip…';
            note = await listenOnce();
          } catch {
            // no note given, that's fine
          }
          await endSession(note);
        }
      } catch (err) {
        statusEl.textContent = `Didn't catch that (${err.message}).`;
      }
    });

    document.getElementById('finish-btn').addEventListener('click', () => endSession());
  } catch (err) {
    body.innerHTML = `<div class="card"><strong>Couldn't load session.</strong><p class="dim">${err.message}</p></div>`;
  }
}
