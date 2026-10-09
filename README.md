# Kasinmiehet

Yksityinen kalastussovellus Ollille, Matille ja Jussille.

## Web (kehitys)

```bash
npm install
npm run dev
```

Avaa http://localhost:5173

## Android (Capacitor)

```bash
npm install
npm run build
npx cap sync android
npx cap open android   # vaatii Android Studion
```

Tai laitteelle/emulaattoriin:

```bash
npx cap run android
```

Taustareitti käyttää `@capacitor-community/background-geolocation` (ilmoitus “Kalastus käynnissä”). Selaimessa reitti tallentuu foreground-GPS:llä.

## Ominaisuudet (proto)

- Kirjautuminen: Olli / Matti / Jussi
- Aloita kalastus → GPS-reitti (natiivi tausta / selain)
- Saaliit + Open-Meteo-sää + jako (Share / Web Share)
- Karttavihjeet, kalenteri, lajiasetukset
- Vesistöehdotus max 2×/pv

## Scriptit

| Komento | Merkitys |
|---|---|
| `npm run dev` | Vite-dev |
| `npm run build` | Tuotantobuild → `dist/` |
| `npm run sync:android` | build + `cap sync android` |
