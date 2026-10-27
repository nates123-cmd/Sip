/**
 * One saved list per category, with its writes. Wine, Beer and Spirits all use
 * it -- the only difference between them is what the database lets you see,
 * which is a policy decision and not this file's business.
 *
 * Writes are optimistic on delete only. Adds and ratings wait for the row the
 * server actually stored, because both can be rewritten on the way in: `source`
 * falls back when a CHECK rejects the tag, and rating stamps `tasted_on`.
 * Showing a guess and then correcting it is worse than a beat of latency.
 *
 * Photos ride along on the same rows (see lib/photos.js). A photo is never
 * allowed to cost the drink: if the upload fails the drink is still saved and
 * the error says so.
 */
import { useCallback, useEffect, useState } from 'react'
import {
  listTastings, addTasting, rateTasting, unrateTasting, deleteTasting, setTastingPhoto,
} from './tastings'
import { uploadPhoto, removePhoto } from './photos'

export function useDrinks(category) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let live = true
    setLoading(true)
    listTastings(category)
      .then((data) => { if (live) { setRows(data); setError(null) } })
      .catch((e) => { if (live) setError(e.message) })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [category])

  /* `photo` is a File, usually the label he just photographed to identify it.
   * Uploaded first so the row lands in one insert with its path already set. */
  const add = useCallback(async ({ photo, ...payload }) => {
    let photo_path = null
    let photoErr = null
    if (photo) {
      try { photo_path = await uploadPhoto(category, photo) } catch (e) { photoErr = e.message }
    }
    const saved = await addTasting({
      category, ...payload, extra: photo_path ? { photo_path } : undefined,
    }).catch(async (e) => { await removePhoto(photo_path); throw e })
    setRows((r) => [saved, ...r.filter((x) => x.id !== saved.id)])
    if (photoErr) setError(`Saved, but the photo did not upload: ${photoErr}`)
    return saved
  }, [category])

  const replace = (saved) =>
    setRows((r) => r.map((x) => (x.id === saved.id ? saved : x)))

  const rate = useCallback(async (id, rating) => {
    try { replace(await rateTasting(id, rating)) } catch (e) { setError(e.message) }
  }, [])

  const unrate = useCallback(async (id) => {
    try { replace(await unrateTasting(id)) } catch (e) { setError(e.message) }
  }, [])

  /* Add or replace. The old object goes only once the row points at the new
   * one, so a failure anywhere leaves the row showing a photo that exists. */
  const setPhoto = useCallback(async (row, file) => {
    // Read before any write: `row` may be the very object the write updates.
    const old = row.photo_path
    try {
      const path = await uploadPhoto(category, file)
      try {
        replace(await setTastingPhoto(row.id, path))
      } catch (e) {
        await removePhoto(path)
        throw e
      }
      await removePhoto(old)
    } catch (e) {
      setError(e.message)
    }
  }, [category])

  const clearPhoto = useCallback(async (row) => {
    const old = row.photo_path
    try {
      replace(await setTastingPhoto(row.id, null))
      await removePhoto(old)
    } catch (e) {
      setError(e.message)
    }
  }, [])

  const remove = useCallback(async (id, photoPath) => {
    let prev
    setRows((r) => { prev = r; return r.filter((x) => x.id !== id) })
    try {
      await deleteTasting(id)
      await removePhoto(photoPath)
    } catch (e) {
      setRows(prev)
      setError(e.message)
    }
  }, [])

  return { rows, loading, error, setError, add, rate, unrate, remove, setPhoto, clearPhoto }
}
