import { precacheAndRoute } from 'workbox-precaching';

precacheAndRoute(self.__WB_MANIFEST);

// Fired when the send-nudge Edge Function (triggered by pg_cron at 07:30
// and again at 07:50 if nothing's logged yet) sends a Web Push message.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data?.json() ?? {};
  } catch {
    // ignore malformed payloads
  }
  const title = data.title || 'Step Up';
  const body = data.body || 'Time to train!';
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow('/step-up/'));
});
