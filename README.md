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
