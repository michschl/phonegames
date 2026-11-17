# Browser-Tests

Die wichtigsten Abläufe der App, durchgespielt in Chromium auf einem Handy-Bildschirm (Pixel 7) mit
[Playwright](https://playwright.dev). Sie laufen in GitHub Actions vor jedem Deploy (Job «Browser-Tests» in
[`ci.yml`](../.github/workflows/ci.yml)).

| Datei | Inhalt |
| --- | --- |
| `app.spec.ts` | Registrierung mit Einladungscode, Anmelden/Abmelden, Tabs, alle Spielseiten, Barrierefreiheit, 280 px |
| `spickzettel.spec.ts` | Tab «Lernen» (Einführung, Heute dran), Stapelseite, allein ohne Gruppe, ein Tipp von der Startseite, Antwortart pro Person, Namenstafeln und Badges (auch 360 px), Ende der Runde mit Duell-Vorschlag, Lernserie, Stapelliste mit Suche |
| `spielformen.spec.ts` | «Wer spielt mit?», Duell, Blitzrunde, Schätzrunde (kleines Handy, 360 × 520 px), Lückentext |
| `stapel.spec.ts` | Fotos (Kamera/Galerie, genau übernehmen, neue Aufgaben erfinden), Teilen per Link, Löschen mit «Rückgängig» (Stapel, Karten, Gruppen, Personen) |

- **Testserver** ([`server.ts`](server.ts)): die echte App mit Datenbank im Speicher, ohne Rate-Limits und mit einer
  Schein-KI, die immer dieselben Karten liefert – Infomaniak wird nie aufgerufen. Playwright startet ihn selbst
  (Port 3100).
- **Service Worker** sind in den Tests ausgeschaltet; das Update-Verhalten der PWA ist hier nicht abgedeckt.
- **Barrierefreiheit**: `expectAccessible()` prüft mit axe-core (WCAG 2.2 AA), nachdem die Einblend-Animationen
  fertig sind.

```bash
npm run test:e2e                                   # baut die App und startet alle Tests
npx playwright test --trace off                    # App schon gebaut
npx playwright test -g "Lückentext" --trace off    # nur ein Test
```

Bei einem Fehler in GitHub Actions liegt der Bericht (mit Trace des Wiederholungsversuchs) als Artefakt
«playwright-report» beim Lauf.
