import { savePushSubscription } from '../db.js';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export async function renderSettings(root) {
  const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';
  const supported = 'serviceWorker' in navigator && 'PushManager' in window;
  const already = supported && Notification.permission === 'granted';

  root.innerHTML = `
    <h1>Settings</h1>
    <div class="card">
      <h2 style="margin-top:0">Daily reminder</h2>
      <p class="dim">A push notification at 7:30, and a nudge around 7:50 if today's workout hasn't started yet.</p>
      ${
        !supported
          ? `<p class="dim">Push notifications aren't supported in this browser.</p>`
          : !vapidKey
            ? `<p class="dim">VITE_VAPID_PUBLIC_KEY isn't set.</p>`
            : `<button class="primary" id="enable-push-btn">${already ? 'Notifications enabled ✓' : 'Enable daily reminder'}</button>
               <p class="dim" id="push-status"></p>`
      }
    </div>
  `;

  const btn = document.getElementById('enable-push-btn');
  btn?.addEventListener('click', async () => {
    const statusEl = document.getElementById('push-status');
    btn.disabled = true;
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        statusEl.textContent = 'Permission was not granted.';
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
      await savePushSubscription(sub.toJSON());
      btn.textContent = 'Notifications enabled ✓';
      statusEl.textContent = "You're set for the 7:30 reminder.";
    } catch (err) {
      statusEl.textContent = `Couldn't enable notifications (${err.message}).`;
    } finally {
      btn.disabled = false;
    }
  });
}
