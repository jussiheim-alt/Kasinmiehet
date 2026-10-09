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

## Asenna Android-kotinäytölle (Chrome)

Chrome tarjoaa “Asenna sovellus” / “Lisää kotinäytölle” vain kun:
1. Sivusto on **HTTPS** (Render OK)
2. On **web app manifest** + ikonit
3. On **service worker**

Nämä on nyt mukana (`vite-plugin-pwa`). Avaa Render-URL Chromessa → valikko ⋮ → **Asenna sovellus** / **Lisää kotinäytölle**.

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

- Käyttäjävalinta: Olli / Matti / Jussi (ei PIN-suojausta)
- Jaettu backend (saaliit, sessiot, kalenteri, lajipreferenssit)
- OpenStreetMap-kartta + Overpass/Photon -vesistömaski
- Open-Meteo-ilmasää + **SYKE / ympäristö.fi** pintaveden lämpötila (lähin havaintopaikka)
- Saaliiden / lähtöjen jako
- Capacitor Android + iOS -kuoret
