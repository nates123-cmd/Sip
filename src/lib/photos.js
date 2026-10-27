/**
 * A photo of the bottle, kept on a saved drink.
 *
 * The row stores a storage PATH, never the image. A list load selects up to 400
 * rows and the whole suite shares a 5 GB monthly egress cap, so a base64 column
 * would re-download every photo on every load. Instead each photo is fetched
 * once, on the row that shows it, and kept on the device.
 *
 * Paths are <user_id>/<category>/<uuid>.jpg. The bucket policy reads the
 * household split straight off that path (see
 * supabase/migrations/20261027_sip_bottle_photos.sql): wine photos are shared
 * the way wine rows are, beer and spirit photos stay private. A new photo is
 * always a new uuid and an object is never rewritten, which is what makes it
 * safe to cache forever.
 *
 * The bucket is private, so there is no stable public URL to hand an <img>.
 * Signed URLs change every time they are minted and so defeat the browser
 * cache; downloading the bytes once and keeping them in Cache Storage does not.
 */
import { supabase } from './supabase'

const BUCKET = 'sip-photos'
const CACHE = 'sip-photos-v1'

/* Big enough to read the label on a phone held at arm's length, small enough
 * that a cellar of photos is a few megabytes. ~80 KB at this size. */
const MAX_EDGE = 900
const JPEG_QUALITY = 0.78

async function toJpeg(file) {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close?.()
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not read that photo.'))),
      'image/jpeg', JPEG_QUALITY),
  )
}

/** Downscale, upload, return the path to store on the row. */
export async function uploadPhoto(category, file) {
  const { data: sess } = await supabase.auth.getSession()
  const uid = sess?.session?.user?.id
  if (!uid) throw new Error('Signed out. Sign in and try again.')

  const blob = await toJpeg(file)
  const path = `${uid}/${category}/${crypto.randomUUID()}.jpg`
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: 'image/jpeg',
    cacheControl: '31536000',
  })
  if (error) throw new Error(error.message)

  // It is on the device already, so the row that shows it next need not
  // download what was just uploaded.
  remember(path, blob)
  return path
}

/**
 * Best effort. A photo that fails to delete is an orphan costing a few KB of
 * storage; surfacing that as an error would make removing a drink look like it
 * failed when it did not.
 */
export async function removePhoto(path) {
  if (!path) return
  urls.delete(path)
  try { await (await caches.open(CACHE)).delete(cacheKey(path)) } catch { /* no cache */ }
  await supabase.storage.from(BUCKET).remove([path]).catch(() => {})
}

/* ---- reading ------------------------------------------------------------- */

const urls = new Map()

/* Cache Storage wants a URL-shaped key. Nothing is ever fetched from it. */
const cacheKey = (path) => new Request(`https://sip.local/photo/${path}`)

function remember(path, blob) {
  urls.set(path, Promise.resolve(URL.createObjectURL(blob)))
  globalThis.caches?.open(CACHE)
    .then((c) => c.put(cacheKey(path), new Response(blob, { headers: { 'content-type': 'image/jpeg' } })))
    .catch(() => {})
}

async function load(path) {
  try {
    const hit = await (await caches.open(CACHE)).match(cacheKey(path))
    if (hit) return URL.createObjectURL(await hit.blob())
  } catch { /* private window, or no Cache Storage: fall through to the network */ }

  const { data, error } = await supabase.storage.from(BUCKET).download(path)
  if (error) throw new Error(error.message)
  try {
    await (await caches.open(CACHE)).put(cacheKey(path), new Response(data, { headers: { 'content-type': 'image/jpeg' } }))
  } catch { /* still shown, just fetched again next time */ }
  return URL.createObjectURL(data)
}

/** An object URL for the photo, fetched at most once per device. */
export function photoUrl(path) {
  if (!urls.has(path)) {
    const p = load(path)
    p.catch(() => urls.delete(path)) // a failed fetch may be retried later
    urls.set(path, p)
  }
  return urls.get(path)
}
