import { useEffect, useState } from 'react'
import { CatchMap } from './components/CatchMap'
import { formatDuration, formatWhen, USERS } from './data'
import { apiGet } from './lib/api'
import { fishMarkerSvg, speciesColor } from './lib/speciesStyle'
import { useStore } from './store'
import type { Screen } from './types'

function IconHome() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z" />
    </svg>
  )
}
function IconFish() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 12s3-5 9-5 9 5 9 5-3 5-9 5-9-5-9-5Z" />
      <circle cx="9" cy="12" r="1" fill="currentColor" />
      <path d="M16 9.5 21 7v10l-5-2.5" />
    </svg>
  )
}
function IconMap() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="m9 4 6 2 6-2v16l-6 2-6-2-6 2V6l6-2Z" />
      <path d="M9 4v16M15 6v16" />
    </svg>
  )
}
function IconCal() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  )
}
function IconGear() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2M12 19v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M3 12h2M19 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  )
}

export default function App() {
  const store = useStore()
  const [screen, setScreen] = useState<Screen>('login')
  const [toast, setToast] = useState<string | null>(null)
  const [showWaterPrompt, setShowWaterPrompt] = useState(false)

  const user = USERS.find((u) => u.id === store.state.currentUserId)

  useEffect(() => {
    if (!store.state.currentUserId) {
      setScreen('login')
      return
    }
    if (screen === 'login') setScreen('home')
  }, [store.state.currentUserId, screen])

  useEffect(() => {
    if (screen !== 'home') {
      setShowWaterPrompt(false)
      return
    }
    if (!store.state.currentUserId || store.state.session.active) return
    if (store.waterPromptsLeft <= 0) return
    let cancelled = false
    const t = window.setTimeout(() => {
      void store.checkWaterPrompt().then((near) => {
        if (!cancelled && near) setShowWaterPrompt(true)
      })
    }, 2200)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [screen, store.state.currentUserId, store.state.session.active, store.waterPromptsLeft, store])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 2600)
    return () => window.clearTimeout(t)
  }, [toast])

  useEffect(() => {
    if (!store.syncNotice) return
    setToast(store.syncNotice)
    store.clearSyncNotice()
  }, [store.syncNotice, store])

  const speciesName = (id: string) =>
    store.species.find((s) => s.id === id)?.name ?? id

  if (!user || screen === 'login') {
    return (
      <div className="app-shell">
        <div className="app-bg" aria-hidden />
        <div className="app-frame">
          <Login onPick={(id) => store.login(id)} />
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <div className="app-bg" aria-hidden />
      <div className="app-frame">
        {screen === 'home' && (
          <Home
            userName={user.name}
            onCatch={() => setScreen('catch')}
            onCatches={() => setScreen('catches')}
            onStart={() => {
              void store.startSession().then((mode) => {
                setToast(
                  mode === 'native-background'
                    ? 'Kalastus käynnissä — taustareitti'
                    : mode === 'web'
                      ? 'Kalastus käynnissä — GPS-reitti'
                      : 'Kalastus käynnissä',
                )
              })
            }}
            onStop={() => {
              void store.stopSession().then(() => setToast('Kalastus päättyi'))
            }}
            onDeparture={() => {
              void store.sendDeparture().then((msg) => setToast(msg))
            }}
          />
        )}
        {screen === 'catch' && (
          <CatchForm
            onBack={() => setScreen('home')}
            onSaved={() => {
              setToast('Saalis tallennettu')
              setScreen('catches')
            }}
          />
        )}
        {screen === 'catches' && (
          <CatchesList
            speciesName={speciesName}
            onShare={(id) => {
              void store.shareCatch(id).then((ok) =>
                setToast(ok ? 'Saalis jaettu' : 'Jakaminen epäonnistui'),
              )
            }}
          />
        )}
        {screen === 'map' && <MapScreen speciesName={speciesName} />}
        {screen === 'calendar' && (
          <CalendarScreen
            onNotify={() => setToast('Muistutus asetettu')}
            onDeparture={() => {
              void store.sendDeparture().then((msg) => setToast(msg))
            }}
          />
        )}
        {screen === 'settings' && (
          <SettingsScreen onLogout={() => store.logout()} />
        )}

        <nav className="nav" aria-label="Päänavigaatio">
          {(
            [
              ['home', 'Koti', <IconHome key="h" />],
              ['catches', 'Saaliit', <IconFish key="f" />],
              ['map', 'Kartta', <IconMap key="m" />],
              ['calendar', 'Kalenteri', <IconCal key="c" />],
              ['settings', 'Asetukset', <IconGear key="g" />],
            ] as const
          ).map(([id, label, icon]) => (
            <button
              key={id}
              type="button"
              className={screen === id ? 'active' : ''}
              onClick={() => setScreen(id)}
            >
              {icon}
              {label}
            </button>
          ))}
        </nav>

        {showWaterPrompt && store.waterPromptsLeft > 0 && !store.state.session.active && (
          <div className="modal-backdrop" role="dialog" aria-modal="true">
            <div className="modal glass glass-strong">
              <h2>Aloitetaanko kalastus?</h2>
              <p>
                GPS tunnistaa, että olet vesistön lähellä. Reitti tallentuu taustalla,
                kun sessio käynnistyy. ({store.waterPromptsLeft} ehdotusta jäljellä tänään)
              </p>
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-primary btn-block"
                  onClick={() => {
                    void store.recordWaterPrompt(true).then(() => {
                      setShowWaterPrompt(false)
                      setToast('Kalastus käynnissä')
                    })
                  }}
                >
                  Kyllä, aloita
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-block"
                  onClick={() => {
                    void store.recordWaterPrompt(false).then(() =>
                      setShowWaterPrompt(false),
                    )
                  }}
                >
                  Ei nyt
                </button>
              </div>
            </div>
          </div>
        )}

        {toast && <div className="toast">{toast}</div>}
      </div>
    </div>
  )
}

function Login({ onPick }: { onPick: (id: 'olli' | 'matti' | 'jussi') => void }) {
  return (
    <section className="screen login-screen">
      <div className="eyebrow">Yksityinen ryhmäappi</div>
      <h1 className="brand">
        Kasin
        <br />
        <span>miehet</span>
      </h1>
      <p className="lede">
        Saaliit, reitit ja kalastuspäivät — Olli, Matti ja Jussi samassa veneessä.
      </p>
      <div className="user-grid">
        {USERS.map((u) => (
          <button
            key={u.id}
            type="button"
            className="user-chip"
            onClick={() => onPick(u.id)}
          >
            <span className="avatar">{u.initials}</span>
            <span>
              <strong>{u.name}</strong>
              <br />
              <span className="muted" style={{ fontSize: '0.85rem' }}>
                Jatka käyttäjänä
              </span>
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}

function Home({
  userName,
  onCatch,
  onCatches,
  onStart,
  onStop,
  onDeparture,
}: {
  userName: string
  onCatch: () => void
  onCatches: () => void
  onStart: () => void
  onStop: () => void
  onDeparture: () => void
}) {
  const store = useStore()
  const recent = store.state.catches.slice(0, 3)

  return (
    <section className="screen">
      <div className="topbar">
        <div>
          <div className="eyebrow">Hei, {userName}</div>
          <h1 className="brand" style={{ fontSize: '2.1rem' }}>
            Kasin<span>miehet</span>
          </h1>
          {store.apiOnline != null && (
            <p className="muted" style={{ margin: '6px 0 0', fontSize: '0.78rem' }}>
              {store.apiOnline ? 'Synkka: jaettu palvelin' : 'Synkka: paikallinen (offline)'}
            </p>
          )}
        </div>
        <button type="button" className="btn btn-ghost" style={{ minHeight: 42, padding: '0 14px' }} onClick={onDeparture}>
          Lähden
        </button>
      </div>

      <div className="weather-strip glass">
        <div className="weather-item">
          <strong>{store.weather.tempC}°</strong>
          <span>Ilma</span>
        </div>
        <div className="weather-item">
          <strong>
            {store.weather.windMs}
            <small> m/s</small>
          </strong>
          <span>Tuuli {store.weather.windDir}</span>
        </div>
        <div className="weather-item">
          <strong>{store.weather.pressureHpa}</strong>
          <span>hPa</span>
        </div>
        <div className="weather-item">
          <strong>{store.weather.waterTempC ?? '—'}°</strong>
          <span>Vesi</span>
        </div>
      </div>
      {store.weather.waterTempC != null && store.weather.waterTempStation && (
        <p className="muted" style={{ margin: '-8px 0 14px', fontSize: '0.75rem' }}>
          Vedenlämpö: {store.weather.waterTempStation}
          {store.weather.waterTempDistanceKm != null
            ? ` (${store.weather.waterTempDistanceKm} km)`
            : ''}
          {' · '}
          SYKE / ympäristö.fi
        </p>
      )}

      {store.state.session.active && store.state.session.startedAt ? (
        <div className="session-banner glass">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="live-dot" />
            <div>
              <strong>Kalastus käynnissä</strong>
              <div className="muted" style={{ fontSize: '0.85rem' }}>
                {formatDuration(store.state.session.startedAt)} ·{' '}
                {store.state.session.points.length} pistettä
                {store.trackingMode === 'native-background'
                  ? ' · tausta'
                  : store.trackingMode === 'web'
                    ? ' · GPS'
                    : ''}
                {store.state.session.participants &&
                store.state.session.participants.length > 0
                  ? ` · ${store.state.session.participants
                      .map((id) => USERS.find((u) => u.id === id)?.name ?? id)
                      .join(', ')}`
                  : ''}
                {store.lastFix
                  ? ` · ${store.lastFix.lat.toFixed(3)}, ${store.lastFix.lng.toFixed(3)}`
                  : ''}
              </div>
            </div>
          </div>
          <button type="button" className="btn btn-danger" style={{ minHeight: 40, padding: '0 14px' }} onClick={onStop}>
            Lopeta
          </button>
        </div>
      ) : (
        <div className="hero-actions">
          <button type="button" className="btn btn-primary btn-block" onClick={onStart}>
            Aloita kalastus
          </button>
          <button type="button" className="btn btn-ghost btn-block" onClick={onCatch}>
            Kirjaa saalis
          </button>
        </div>
      )}

      {store.state.session.active && (
        <div className="hero-actions">
          <button type="button" className="btn btn-primary btn-block" onClick={onCatch}>
            Kirjaa saalis nyt
          </button>
        </div>
      )}

      <div className="section-title">
        <h2>Viimeisimmät saaliit</h2>
        <button type="button" onClick={onCatches}>
          Kaikki
        </button>
      </div>
      {recent.length === 0 ? (
        <p className="muted glass" style={{ padding: 16, margin: 0 }}>
          Ei vielä saaliita. Kirjaa ensimmäinen painikkeella “Kirjaa saalis”.
        </p>
      ) : (
        <div className="catch-list">
          {recent.map((c) => {
            const hint = store.areaHint(c.lat, c.lng)
            const name =
              store.species.find((s) => s.id === c.speciesId)?.name ?? c.speciesId
            const angler = USERS.find((u) => u.id === c.userId)?.name
            return (
              <div key={c.id} className="catch-row glass">
                <div className="catch-icon">
                  <IconFish />
                </div>
                <div>
                  <h3>{name}</h3>
                  <p>
                    {angler} · {formatWhen(c.createdAt)}
                    {c.lengthCm ? ` · ${c.lengthCm} cm` : ''}
                  </p>
                </div>
                <span className={`badge ${hint}`}>
                  {hint === 'good' ? 'Hyvä' : hint === 'avoid' ? 'Vältä' : 'Alue'}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

function CatchForm({ onBack, onSaved }: { onBack: () => void; onSaved: () => void }) {
  const store = useStore()
  const [speciesId, setSpeciesId] = useState(store.species[0]?.id ?? '')
  const [lengthCm, setLengthCm] = useState('')
  const [note, setNote] = useState('')
  const [photoLabel, setPhotoLabel] = useState<string | null>(null)

  return (
    <section className="screen">
      <div className="topbar">
        <h1>Uusi saalis</h1>
        <button type="button" className="btn btn-ghost" style={{ minHeight: 40 }} onClick={onBack}>
          Peru
        </button>
      </div>

      <div className="photo-slot glass" role="button" tabIndex={0} onClick={() => setPhotoLabel('Saaliskuva lisätty (demo)')}>
        {photoLabel ?? 'Lisää kuva saaliista / vieheestä'}
      </div>

      <div className="field">
        <label htmlFor="species">Kalalaji</label>
        <select id="species" value={speciesId} onChange={(e) => setSpeciesId(e.target.value)}>
          {store.species.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {store.isUndesired(s.id) ? ' (ei-haluttu sinulle)' : ''}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="len">Pituus (cm, valinnainen)</label>
        <input
          id="len"
          inputMode="decimal"
          placeholder="esim. 72"
          value={lengthCm}
          onChange={(e) => setLengthCm(e.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="note">Muistiinpano</label>
        <textarea
          id="note"
          placeholder="Viehe, syvyys, olosuhteet…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      <p className="muted" style={{ fontSize: '0.85rem', marginTop: 0 }}>
        Sijainti: GPS · Sää liitetään automaattisesti ({store.weather.tempC}°, tuuli{' '}
        {store.weather.windMs} m/s)
      </p>

      <button
        type="button"
        className="btn btn-primary btn-block"
        onClick={() => {
          void store
            .addCatch({
              speciesId,
              lengthCm: lengthCm ? Number(lengthCm) : undefined,
              note: note || undefined,
            })
            .then(onSaved)
        }}
      >
        Tallenna saalis
      </button>
    </section>
  )
}

function CatchesList({
  speciesName,
  onShare,
}: {
  speciesName: (id: string) => string
  onShare: (id: string) => void
}) {
  const store = useStore()
  return (
    <section className="screen">
      <div className="topbar">
        <h1>Saaliit</h1>
      </div>
      {store.state.catches.length === 0 ? (
        <p className="muted glass" style={{ padding: 16, margin: 0 }}>
          Ei saaliita vielä.
        </p>
      ) : (
        <div className="catch-list">
          {store.state.catches.map((c) => {
            const hint = store.areaHint(c.lat, c.lng)
            return (
              <div key={c.id} className="catch-row glass">
                <div className="catch-icon">
                  <IconFish />
                </div>
                <div>
                  <h3>{speciesName(c.speciesId)}</h3>
                  <p>
                    {USERS.find((u) => u.id === c.userId)?.name} ·{' '}
                    {formatWhen(c.createdAt)}
                    {c.lengthCm ? ` · ${c.lengthCm} cm` : ''}
                  </p>
                  <p>
                    {c.weather.tempC}° · {c.weather.windMs} m/s · {c.weather.pressureHpa}{' '}
                    hPa
                    {c.weather.waterTempC != null
                      ? ` · vesi ${c.weather.waterTempC}°`
                      : ''}
                  </p>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{
                      minHeight: 34,
                      marginTop: 8,
                      padding: '0 12px',
                      fontSize: '0.8rem',
                    }}
                    onClick={() => onShare(c.id)}
                  >
                    Jaa
                  </button>
                </div>
                <span className={`badge ${hint}`}>
                  {hint === 'good'
                    ? 'Haluttu'
                    : hint === 'avoid'
                      ? 'Ei-haluttu'
                      : '—'}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

function MapScreen({ speciesName }: { speciesName: (id: string) => string }) {
  const store = useStore()
  const legendSpecies = store.species.filter((s) =>
    store.state.catches.some((c) => c.speciesId === s.id),
  )
  const legendList =
    legendSpecies.length > 0
      ? legendSpecies
      : store.species.slice(0, 6)

  return (
    <section className="screen">
      <div className="topbar">
        <h1>Kartta</h1>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>
        Kalastuskartta: SYKE:n syvyyskäyrät + saaliit kalasymboleina lajin värillä.
        Kerrokset voi vaihtaa kartan vasemmasta yläkulmasta.
      </p>
      <div className="map-panel map-panel-live">
        <CatchMap
          catches={store.state.catches}
          areaHint={store.areaHint}
          center={store.lastFix}
          routePoints={
            store.state.session.active ? store.state.session.points : undefined
          }
          speciesName={speciesName}
        />
      </div>
      <div className="map-legend glass">
        <strong>Lajit kartalla</strong>
        <div className="map-legend-rows">
          {legendList.map((s) => (
            <div key={s.id} className="map-legend-row">
              <span
                className="map-legend-fish"
                dangerouslySetInnerHTML={{
                  __html: fishMarkerSvg(speciesColor(s.id), 22),
                }}
              />
              <span>{s.name}</span>
            </div>
          ))}
        </div>
        <p className="muted" style={{ margin: '8px 0 0', fontSize: '0.75rem' }}>
          Syvyysaineisto © SYKE (CC BY 4.0). Kaikilla järvillä ei ole luotausta.
        </p>
      </div>
      {store.state.session.points.length > 0 && (
        <p className="muted" style={{ fontSize: '0.85rem' }}>
          Viimeisin reitti: {store.state.session.points.length} GPS-pistettä
          {store.trackingMode === 'native-background'
            ? ' (natiivi tausta)'
            : store.trackingMode === 'web'
              ? ' (selain)'
              : ''}
        </p>
      )}
      <div className="section-title" style={{ marginTop: 18 }}>
        <h2>Aluevinkit</h2>
      </div>
      {store.state.catches.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>
          Ei saaliita kartalla vielä.
        </p>
      ) : (
        <div className="stack">
          {store.state.catches.slice(0, 4).map((c) => {
            const hint = store.areaHint(c.lat, c.lng)
            return (
              <div key={c.id} className="day-row glass">
                <div>
                  <strong>{speciesName(c.speciesId)}</strong>
                  <div className="muted" style={{ fontSize: '0.82rem' }}>
                    {c.lat.toFixed(3)}, {c.lng.toFixed(3)}
                  </div>
                </div>
                <span className={`badge ${hint}`}>
                  {hint === 'good'
                    ? 'Suositeltu'
                    : hint === 'avoid'
                      ? 'Vältä'
                      : 'Neutraali'}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

type CalendarDay = {
  date: string
  rating: number
  level: 'hyva' | 'keskiverto' | 'kohtalainen' | 'huono'
  label: string
  shortLabel: string
  sun: { rise: string | null; set: string | null } | null
  moon: { rise: string | null; set: string | null } | null
  feedWindows: { kind: string; start: string; end: string }[]
}

type CalendarPayload = {
  days: CalendarDay[]
  attribution: string
  source: string
  warning?: string
}

function CalendarScreen({
  onNotify,
  onDeparture,
}: {
  onNotify: () => void
  onDeparture: () => void
}) {
  const store = useStore()
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [title, setTitle] = useState('')
  const [cal, setCal] = useState<CalendarPayload | null>(null)
  const [calError, setCalError] = useState<string | null>(null)
  const [calLoading, setCalLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setCalLoading(true)
      setCalError(null)
      try {
        const fix = store.lastFix
        const lat = fix?.lat ?? 60.17
        const lng = fix?.lng ?? 24.94
        const data = await apiGet<CalendarPayload>(
          `/api/kalakalenteri?lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}`,
        )
        if (!cancelled) {
          setCal(data)
          const today = new Date().toISOString().slice(0, 10)
          setExpanded(data.days.find((d) => d.date === today)?.date ?? data.days[0]?.date ?? null)
        }
      } catch (e) {
        if (!cancelled) {
          setCalError(e instanceof Error ? e.message : 'Kalenteri ei latautunut')
        }
      } finally {
        if (!cancelled) setCalLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [store.lastFix?.lat, store.lastFix?.lng])

  const ratingByDate = new Map((cal?.days ?? []).map((d) => [d.date, d]))

  return (
    <section className="screen">
      <div className="topbar">
        <h1>Kalenteri</h1>
      </div>

      <div className="glass fish-cal" style={{ padding: 16, marginBottom: 18 }}>
        <div className="fish-cal-head">
          <strong>Kalastuskalenteri</strong>
          <span className="muted" style={{ fontSize: '0.8rem' }}>
            {calLoading ? 'Ladataan…' : cal?.attribution || '—'}
          </span>
        </div>
        {calError && (
          <p className="muted" style={{ margin: '8px 0 0' }}>
            {calError}
          </p>
        )}
        {cal?.warning && !calError && (
          <p className="muted" style={{ margin: '8px 0 0', fontSize: '0.8rem' }}>
            Varalla oleva arvio ({cal.warning})
          </p>
        )}
        <div className="fish-cal-list">
          {(cal?.days ?? []).map((d) => {
            const open = expanded === d.date
            const when = new Date(`${d.date}T12:00:00`).toLocaleDateString('fi-FI', {
              weekday: 'short',
              day: 'numeric',
              month: 'numeric',
            })
            return (
              <div key={d.date} className={`fish-cal-day level-${d.level}`}>
                <button
                  type="button"
                  className="fish-cal-summary"
                  onClick={() => setExpanded(open ? null : d.date)}
                  aria-expanded={open}
                >
                  <span className="fish-cal-when">{when}</span>
                  <span className={`fish-cal-badge level-${d.level}`}>{d.shortLabel}</span>
                  <span className="fish-cal-score">{d.rating.toFixed(1)}</span>
                </button>
                {open && (
                  <div className="fish-cal-detail">
                    <p style={{ margin: '0 0 8px' }}>{d.label}</p>
                    {(d.sun || d.moon) && (
                      <div className="fish-cal-astro muted">
                        {d.sun && (
                          <span>
                            Aurinko {d.sun.rise ?? '—'} → {d.sun.set ?? '—'}
                          </span>
                        )}
                        {d.moon && (
                          <span>
                            Kuu {d.moon.rise ?? '—'} → {d.moon.set ?? '—'}
                          </span>
                        )}
                      </div>
                    )}
                    {d.feedWindows.length > 0 && (
                      <>
                        <div className="muted" style={{ fontSize: '0.8rem', marginTop: 8 }}>
                          Syöntiajat
                        </div>
                        <div className="fish-cal-feeds">
                          {d.feedWindows.map((w, i) => (
                            <span key={`${d.date}-${i}`} className={`feed-chip ${w.kind}`}>
                              {w.start}–{w.end}
                            </span>
                          ))}
                        </div>
                      </>
                    )}
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ minHeight: 36, marginTop: 10, padding: '0 12px' }}
                      onClick={() => {
                        setDate(d.date)
                        setTitle(`${d.shortLabel} kalastus`)
                      }}
                    >
                      Käytä päivänä
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <h2 className="section-title">Ryhmän kalastuspäivät</h2>
      <div className="stack" style={{ marginBottom: 18 }}>
        {store.state.fishingDays.length === 0 && (
          <p className="muted" style={{ margin: 0 }}>
            Ei vielä merkittyjä päiviä.
          </p>
        )}
        {store.state.fishingDays.map((d) => {
          const tip = ratingByDate.get(d.date)
          return (
            <div key={d.id} className="day-row glass">
              <div>
                <strong>{d.title}</strong>
                <div className="muted" style={{ fontSize: '0.85rem' }}>
                  {new Date(`${d.date}T12:00:00`).toLocaleDateString('fi-FI', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                  })}{' '}
                  · {d.participants.map((id) => USERS.find((u) => u.id === id)?.name).join(', ')}
                </div>
                {tip && (
                  <span className={`fish-cal-badge inline level-${tip.level}`}>
                    {tip.shortLabel} · {tip.rating.toFixed(1)}
                  </span>
                )}
              </div>
              <button type="button" className="btn btn-ghost" style={{ minHeight: 38, padding: '0 12px' }} onClick={onNotify}>
                Muistuta
              </button>
            </div>
          )
        })}
      </div>

      <div className="glass" style={{ padding: 16 }}>
        <div className="field">
          <label htmlFor="fd">Uusi kalastuspäivä</label>
          <input id="fd" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="ft">Otsikko</label>
          <input
            id="ft"
            placeholder="Aamulähtö"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <button
          type="button"
          className="btn btn-primary btn-block"
          onClick={() => {
            store.addFishingDay(date, title)
            setTitle('')
            onNotify()
          }}
        >
          Lisää päivä
        </button>
      </div>

      <button
        type="button"
        className="btn btn-ghost btn-block"
        style={{ marginTop: 12 }}
        onClick={onDeparture}
      >
        Lähetä lähtöilmoitus ryhmälle
      </button>
    </section>
  )
}

function SettingsScreen({ onLogout }: { onLogout: () => void }) {
  const store = useStore()
  const [newSpecies, setNewSpecies] = useState('')

  return (
    <section className="screen">
      <div className="topbar">
        <h1>Asetukset</h1>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>
        Lajit ovat oletuksena <strong style={{ color: 'var(--text)' }}>haluttuja</strong>. Merkitse
        ei-halutut — ne värjäävät kartan varoituksella.
      </p>
      <div className="species-list">
        {store.species.map((s) => {
          const on = store.isUndesired(s.id)
          return (
            <div key={s.id} className="species-row">
              <div>
                <strong>{s.name}</strong>
                <div className="muted" style={{ fontSize: '0.8rem' }}>
                  {on ? 'Ei-haluttu' : 'Haluttu'}
                </div>
              </div>
              <button
                type="button"
                className={`toggle ${on ? 'on' : ''}`}
                aria-pressed={on}
                aria-label={`${s.name} ei-haluttu`}
                onClick={() => store.toggleUndesired(s.id)}
              />
            </div>
          )
        })}
      </div>

      <div className="glass" style={{ padding: 16, marginTop: 18 }}>
        <div className="field">
          <label htmlFor="ns">Lisää kalalaji</label>
          <input
            id="ns"
            placeholder="esim. Siika"
            value={newSpecies}
            onChange={(e) => setNewSpecies(e.target.value)}
          />
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-block"
          onClick={() => {
            store.addSpecies(newSpecies)
            setNewSpecies('')
          }}
        >
          Lisää listaan
        </button>
      </div>

      <button
        type="button"
        className="btn btn-danger btn-block"
        style={{ marginTop: 18 }}
        onClick={onLogout}
      >
        Vaihda käyttäjää
      </button>
    </section>
  )
}
