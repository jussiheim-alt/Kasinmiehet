import { useEffect, useMemo, useState } from 'react'
import { formatDuration, formatWhen, USERS } from './data'
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
    if (!store.state.currentUserId || store.state.session.active) return
    if (store.waterPromptsLeft <= 0) return
    const t = window.setTimeout(() => setShowWaterPrompt(true), 2200)
    return () => window.clearTimeout(t)
  }, [store.state.currentUserId, store.state.session.active, store.waterPromptsLeft])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 2600)
    return () => window.clearTimeout(t)
  }, [toast])

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
              store.startSession()
              setToast('Kalastus käynnissä — reitti tallentuu')
            }}
            onStop={() => {
              store.stopSession()
              setToast('Kalastus päättyi')
            }}
            onDeparture={() => setToast(store.sendDeparture())}
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
        {screen === 'catches' && <CatchesList speciesName={speciesName} />}
        {screen === 'map' && <MapScreen speciesName={speciesName} />}
        {screen === 'calendar' && (
          <CalendarScreen
            onNotify={() => setToast('Muistutus asetettu')}
            onDeparture={() => setToast(store.sendDeparture())}
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
                    store.recordWaterPrompt(true)
                    setShowWaterPrompt(false)
                    setToast('Kalastus käynnissä')
                  }}
                >
                  Kyllä, aloita
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-block"
                  onClick={() => {
                    store.recordWaterPrompt(false)
                    setShowWaterPrompt(false)
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
          <button key={u.id} type="button" className="user-chip" onClick={() => onPick(u.id)}>
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

      {store.state.session.active && store.state.session.startedAt ? (
        <div className="session-banner glass">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="live-dot" />
            <div>
              <strong>Kalastus käynnissä</strong>
              <div className="muted" style={{ fontSize: '0.85rem' }}>
                {formatDuration(store.state.session.startedAt)} · reitti tallentuu
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
      <div className="catch-list">
        {recent.map((c) => {
          const hint = store.areaHint(c.lat, c.lng)
          const name = store.species.find((s) => s.id === c.speciesId)?.name ?? c.speciesId
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
          store.addCatch({
            speciesId,
            lengthCm: lengthCm ? Number(lengthCm) : undefined,
            note: note || undefined,
          })
          onSaved()
        }}
      >
        Tallenna saalis
      </button>
    </section>
  )
}

function CatchesList({ speciesName }: { speciesName: (id: string) => string }) {
  const store = useStore()
  return (
    <section className="screen">
      <div className="topbar">
        <h1>Saaliit</h1>
      </div>
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
                  {USERS.find((u) => u.id === c.userId)?.name} · {formatWhen(c.createdAt)}
                  {c.lengthCm ? ` · ${c.lengthCm} cm` : ''}
                </p>
                <p>
                  {c.weather.tempC}° · {c.weather.windMs} m/s · {c.weather.pressureHpa} hPa
                  {c.weather.waterTempC != null ? ` · vesi ${c.weather.waterTempC}°` : ''}
                </p>
              </div>
              <span className={`badge ${hint}`}>
                {hint === 'good' ? 'Haluttu' : hint === 'avoid' ? 'Ei-haluttu' : '—'}
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function MapScreen({ speciesName }: { speciesName: (id: string) => string }) {
  const store = useStore()
  const dots = useMemo(
    () =>
      store.state.catches.map((c, i) => ({
        id: c.id,
        left: `${18 + ((c.lng * 1000) % 64)}%`,
        top: `${20 + ((c.lat * 1000) % 55)}%`,
        hint: store.areaHint(c.lat, c.lng),
        label: speciesName(c.speciesId),
        i,
      })),
    [store, speciesName],
  )

  return (
    <section className="screen">
      <div className="topbar">
        <h1>Kartta</h1>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>
        ~300 m alueet: vihreä = haluttua saalista, punainen = ei-haluttua (omat asetukset).
      </p>
      <div className="map-panel">
        {store.state.session.active && <div className="route-line" aria-hidden />}
        {dots.map((d) => (
          <span
            key={d.id}
            className={`map-dot ${d.hint}`}
            style={{ left: d.left, top: d.top }}
            title={d.label}
          />
        ))}
      </div>
      <div className="section-title" style={{ marginTop: 18 }}>
        <h2>Aluevinkit</h2>
      </div>
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
                {hint === 'good' ? 'Suositeltu' : hint === 'avoid' ? 'Vältä' : 'Neutraali'}
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
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

  return (
    <section className="screen">
      <div className="topbar">
        <h1>Kalenteri</h1>
      </div>
      <div className="stack" style={{ marginBottom: 18 }}>
        {store.state.fishingDays.map((d) => (
          <div key={d.id} className="day-row glass">
            <div>
              <strong>{d.title}</strong>
              <div className="muted" style={{ fontSize: '0.85rem' }}>
                {new Date(d.date).toLocaleDateString('fi-FI', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                })}{' '}
                · {d.participants.map((id) => USERS.find((u) => u.id === id)?.name).join(', ')}
              </div>
            </div>
            <button type="button" className="btn btn-ghost" style={{ minHeight: 38, padding: '0 12px' }} onClick={onNotify}>
              Muistuta
            </button>
          </div>
        ))}
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
