import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey);

export async function registerPush(userId: string) {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
    const reg = await navigator.serviceWorker.register('/sw.js');
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return null;
    const VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY;
    if (!VAPID) return null;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: VAPID,
    });
    const token = JSON.stringify(sub);
    await supabase.from('profiles').update({ fcm_token: token }).eq('id', userId);
    return token;
  } catch {
    return null;
  }
}

export async function sendPushToClient(clientId: string, title: string, body: string) {
  try {
    const { data } = await supabase.from('profiles').select('fcm_token').eq('id', clientId).single();
    if (data?.fcm_token) {
      // In production: send token to Supabase Edge Function -> FCM
    }
    if (Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/icon.png' });
    }
  } catch {
    // silent
  }
}

export function generateDeviceFingerprint(): string {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.textBaseline = 'top';
    ctx.font = "14px 'Arial'";
    ctx.fillText('fingerprint', 2, 2);
  }
  const canvasData = canvas.toDataURL();
  const nav = navigator;
  const screen = window.screen;
  const raw = [
    nav.userAgent,
    nav.language,
    screen.colorDepth,
    screen.width + 'x' + screen.height,
    new Date().getTimezoneOffset(),
    canvasData.slice(-50),
  ].join('|');
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const char = raw.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return 'dev_' + Math.abs(hash).toString(36) + '_' + Date.now().toString(36);
}
