/**
 * In-memory stand-in for src/lib/photos.js, swapped in when VITE_HARNESS=1.
 * Keeps the picked file as an object URL so the row thumbnail and the viewer
 * can be looked at without a storage bucket. Never bundled by a real build.
 */
const urls = new Map()
let seq = 0

export async function uploadPhoto(category, file) {
  await new Promise((r) => setTimeout(r, 300))
  const path = `dev/${category}/${++seq}.jpg`
  urls.set(path, URL.createObjectURL(file))
  return path
}

export async function removePhoto(path) {
  urls.delete(path)
}

export async function photoUrl(path) {
  if (!urls.has(path)) throw new Error('no such photo')
  return urls.get(path)
}
