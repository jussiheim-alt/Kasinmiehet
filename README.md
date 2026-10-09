# Kasinmiehet

Yksityinen kalastussovellus Ollille, Matille ja Jussille — jaettu data, GPS-reitit, sää ja vesistötunnistus.

## Kehitys (web + API)

```bash
npm install
npm run dev
```

- UI: http://localhost:5173  
- API: http://localhost:8787 (`/api/health`)

Vite proxyttaa `/api` → backend. SQLite-tiedosto: `server/data/kasinmiehet.sqlite`.

## Render (tuotanto)

Yksi Web Service palvelee UI:n + API:n (`render.yaml`).

1. Render Dashboard → **New** → **Blueprint** (tai Web Service) → tämä GitHub-repo  
2. Branch: `main` (mergen jälkeen) tai `cursor/kalastussovellus-ui-de9c` testiin  
3. Build: `npm install && npm run build` · Start: `npm start`  
4. Lisää **Persistent Disk** polkuun `/var/data` (SQLite säilyy restartien yli; free-planilla disk voi vaatia maksullisen planin)

Terveys: `https://<palvelu>.onrender.com/api/health`

Ilman levyä data voi hävitä cold start / redeploy -tilanteessa — levy on suositeltu.

## Android

```bash
npm run sync:android
npx cap open android
```

## iOS (vaatii macOS + Xcode)

```bash
npm run sync:ios
npx cap open ios
```

Taustareitti: `@capacitor-community/background-geolocation`. iOS:n Info.plist sisältää sijaintilupatekstit ja `location` background mode.

## Ominaisuudet

- Jaettu backend (saaliit, sessiot, kalenteri, lajipreferenssit)
- OpenStreetMap/Overpass -vesistömaski (“Aloitetaanko kalastus?” max 2×/pv)
- Open-Meteo-sää
- Saaliiden / lähtöjen jako
- Capacitor Android + iOS -kuoret
