import { configStatus } from './env'
import { savePushSubscription, deletePushSubscription } from '../services/reminders'

export const pushConfigured = () => !!configStatus.config?.vapidPublicKey && 'serviceWorker' in navigator && 'PushManager' in window

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  try {
    return await navigator.serviceWorker.register('/sw.js')
  } catch {
    return null
  }
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export async function getPushSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker?.getRegistration()
  return (await reg?.pushManager.getSubscription()) ?? null
}

export async function enablePush(): Promise<void> {
  if (!pushConfigured()) throw new Error('Push notifications are not configured on this server yet.')
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Notifications are blocked. You can allow them in your browser settings.')
  const reg = (await registerServiceWorker()) ?? (await navigator.serviceWorker.ready)
  const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(configStatus.config!.vapidPublicKey!),
  })
  await savePushSubscription(sub)
}

export async function disablePush(): Promise<void> {
  const sub = await getPushSubscription()
  if (!sub) return
  await deletePushSubscription(sub.endpoint)
  await sub.unsubscribe()
}
