/**
 * The saved list, in two states: bottles you mean to try, and bottles you have.
 *
 * "To try" is not a separate table or a status column -- it is a row with no
 * rating. Rating one is what moves it across, which means there is exactly one
 * way to be in either list and the two can never disagree.
 *
 * Tried is ordered by rating, best first. That is a ranking of what you have
 * actually drunk, made of your own scores -- not the palate model. The model
 * ranks bottles you have NOT tried; this ranks the ones you have, and the two
 * must not be confused for each other.
 *
 * Any row can carry a photo of the bottle. A label photographed to identify the
 * drink is kept automatically; everything else gets one here, from the camera
 * or the library. The photo is how he will recognise the bottle in a shop,
 * which a name typed off a menu often is not.
 */
import { useEffect, useRef, useState } from 'react'
import { Stars } from './Stars'
import { photoUrl } from '../lib/photos'

const VIEWS = [
  { id: 'totry', label: 'To try' },
  { id: 'tried', label: 'Tried' },
]

const metaLine = (r) =>
  [r.producer, r.style, r.origin, r.abv != null ? `${r.abv}%` : null]
    .filter(Boolean)
    .join(' · ')

export function DrinkList({ rows, loading, onRate, onUnrate, onDelete, onPhoto, onClearPhoto }) {
  const [view, setView] = useState('totry')
  const [viewing, setViewing] = useState(null)
  const [pending, setPending] = useState(() => new Set())
  const fileRef = useRef(null)
  const target = useRef(null)

  function pick(row) {
    target.current = row
    fileRef.current?.click()
  }

  async function onPick(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    const row = target.current
    if (!file || !row) return
    setViewing(null)
    setPending((p) => new Set(p).add(row.id))
    try {
      await onPhoto(row, file)
    } finally {
      setPending((p) => { const n = new Set(p); n.delete(row.id); return n })
    }
  }

  /* Look the row up again on every render, so the viewer follows a replaced
   * photo instead of holding the row as it was when it opened. */
  const open = viewing && rows.find((r) => r.id === viewing)

  const totry = rows.filter((r) => r.rating == null)
  /* Best first. `created_at` breaks ties so the order never wobbles between
   * renders, which it would under an unstable sort on equal ratings. */
  const tried = rows
    .filter((r) => r.rating != null)
    .sort((a, b) => Number(b.rating) - Number(a.rating) ||
      String(b.created_at).localeCompare(String(a.created_at)))

  const counts = { totry: totry.length, tried: tried.length }
  const shown = view === 'totry' ? totry : tried

  return (
    <>
      <div className="modes listfilter" role="tablist" aria-label="which list">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            role="tab"
            aria-selected={view === v.id}
            className={'mode' + (view === v.id ? ' active' : '')}
            onClick={() => setView(v.id)}
          >
            {v.label} ({loading ? '…' : counts[v.id]})
          </button>
        ))}
      </div>

      {loading && <div className="held"><span>Loading…</span></div>}

      {!loading && shown.length === 0 && (
        <div className="held">
          <span>
            {view === 'totry'
              ? 'Nothing waiting. Add one above and leave it unrated.'
              : 'Nothing rated yet. Rate something in To try.'}
          </span>
        </div>
      )}

      {shown.map((r, i) => (
        <div className="row logged" key={r.id}>
          {view === 'tried' && <div className="rank">{i + 1}</div>}
          {r.photo_path && <Thumb path={r.photo_path} name={r.name} onOpen={() => setViewing(r.id)} />}
          <div className="name selectable">
            {r.name}
            <div className="meta">{metaLine(r) || '—'}</div>
            <Stars
              value={r.rating ?? 0}
              size={13}
              onChange={(n) => onRate(r.id, n)}
            />
            {!r.photo_path && (
              <button className="tryline photoline" disabled={pending.has(r.id)} onClick={() => pick(r)}>
                {pending.has(r.id) ? 'Adding the photo…' : 'Add a photo'}
              </button>
            )}
          </div>
          <div className="rowacts">
            {view === 'tried' && (
              <button
                className="kill quiet"
                onClick={() => onUnrate(r.id)}
                aria-label={`move ${r.name} back to to try`}
                title="Back to To try"
              >
                ↩
              </button>
            )}
            <button
              className="kill"
              onClick={() => onDelete(r.id, r.photo_path)}
              aria-label={`delete ${r.name}`}
            >
              ×
            </button>
          </div>
        </div>
      ))}

      <input ref={fileRef} type="file" accept="image/*" onChange={onPick} />

      {open?.photo_path && (
        <Viewer
          row={open}
          busy={pending.has(open.id)}
          onReplace={() => pick(open)}
          onRemove={() => { setViewing(null); onClearPhoto(open) }}
          onClose={() => setViewing(null)}
        />
      )}
    </>
  )
}

/* Fetched on first show and then kept on the device (lib/photos.js). Until it
 * arrives the frame holds its place in the paper band colour, so the row does
 * not jump when it lands. */
function usePhoto(path) {
  const [src, setSrc] = useState(null)
  useEffect(() => {
    let live = true
    setSrc(null)
    photoUrl(path).then((u) => { if (live) setSrc(u) }).catch(() => {})
    return () => { live = false }
  }, [path])
  return src
}

function Thumb({ path, name, onOpen }) {
  const src = usePhoto(path)
  return (
    <button className="rowphoto" onClick={onOpen} aria-label={`photo of ${name}`}>
      {src && <img src={src} alt="" />}
    </button>
  )
}

/* The photo at full width on the page ground. No dimmed backdrop and no
 * shadow: it is the same flat paper the rest of the app sits on. */
function Viewer({ row, busy, onReplace, onRemove, onClose }) {
  const src = usePhoto(row.photo_path)

  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  return (
    <div className="viewer" role="dialog" aria-modal="true" aria-label={`photo of ${row.name}`}>
      <div className="viewerhead">
        <div className="name selectable">{row.name}</div>
        <button className="kill" onClick={onClose} aria-label="close">×</button>
      </div>
      <div className="viewerimg">{src && <img src={src} alt={row.name} />}</div>
      <div className="vieweracts">
        <button className="tryline" disabled={busy} onClick={onReplace}>
          {busy ? 'Adding the photo…' : 'Replace photo'}
        </button>
        <button className="tryline" disabled={busy} onClick={onRemove}>Remove photo</button>
      </div>
    </div>
  )
}
