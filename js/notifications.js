export async function requestPermission(state) {
  if (!('Notification' in window)) throw new Error('Este navegador no ofrece notificaciones.');
  const permission = await Notification.requestPermission();
  state.settings.notifications.permission = permission;
  state.settings.notifications.enabled = permission === 'granted';
  if (permission === 'granted') await scheduleGeneralReminder(state);
  return permission;
}

export async function scheduleGeneralReminder(state) {
  if (!('serviceWorker' in navigator) || Notification.permission !== 'granted') return false;
  const registration = await navigator.serviceWorker.ready;
  const [hour, minute] = (state.settings.notifications.dailyTime || '20:00').split(':').map(Number);
  const now = new Date();
  const scheduled = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour || 20, minute || 0);
  if (scheduled <= now) scheduled.setDate(scheduled.getDate() + 1);
  const delay = scheduled.getTime() - now.getTime();
  // Web Push con backend puede sustituir este temporizador cuando se incorpore un servidor.
  window.clearTimeout(window.__sistemaReminder);
  window.__sistemaReminder = window.setTimeout(() => {
    registration.showNotification('SISTEMA — Misiones pendientes', { body: 'Tu disciplina te espera. Revisa tus misiones de hoy.', icon: './icons/icon-192.png', badge: './icons/icon-192.png', tag: 'daily-reminder', data: { url: './index.html' } }).catch(error => console.error('[SISTEMA] No se pudo mostrar el recordatorio.', error));
    scheduleGeneralReminder(state).catch(error => console.error('[SISTEMA] No se pudo programar el recordatorio.', error));
  }, Math.min(delay, 2147483647));
  if (registration.periodicSync) {
    try { await registration.periodicSync.register('sistema-reminder', { minInterval: 24 * 60 * 60 * 1000 }); } catch (error) { console.info('[SISTEMA] Periodic Background Sync no disponible.', error); }
  }
  return true;
}

export async function showTestNotification() {
  if (!('Notification' in window) || Notification.permission !== 'granted') throw new Error('Activa primero el permiso de notificaciones.');
  const registration = await navigator.serviceWorker.ready;
  await registration.showNotification('SISTEMA — Prueba de notificación', { body: 'Las notificaciones están listas en este dispositivo.', icon: './icons/icon-192.png', tag: 'sistema-test', data: { url: './index.html' } });
}
