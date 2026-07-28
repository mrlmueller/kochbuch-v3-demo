# kochbuch

Rezept-App mit Bild-zu-Rezept-Pipeline: Foto rein, strukturiertes Rezept raus.
Läuft im Eigenbetrieb und wird täglich von einem kleinen Nutzerkreis benutzt.

## Das Problem

Rezepte sammeln sich als Fotos, Screenshots und Links an. Sie sind damit nicht
durchsuchbar, nicht sortierbar und nicht auswertbar. Die App macht daraus
strukturierte Datensätze: Zutaten mit Mengen, Zubereitungsschritte, Nährwerte.

## Stack

**Backend** — Go 1.26, [chi](https://github.com/go-chi/chi) als Router,
[pgx](https://github.com/jackc/pgx) auf PostgreSQL, [goose](https://github.com/pressly/goose)
für die Migrationen, Cloudinary für die Bildablage.

**LLM** — Anthropic- und OpenAI-SDK hinter einer gemeinsamen Schnittstelle
(`internal/ai/`), inklusive Kostenerfassung pro Anfrage. Der Ausfall oder eine
Preisänderung bei einem Anbieter legt das Feature nicht still.

**Frontend** — Next.js 16, React 19, TypeScript, Tailwind 4, Radix.

**Betrieb** — docker-compose mit Postgres, Backend und
[Caddy](https://caddyserver.com) als Reverse Proxy mit automatischem TLS.
Images über GHCR, Deployment über einen self-hosted Runner.

## Wie die Verarbeitung läuft

Ein hochgeladenes Bild wird nicht synchron verarbeitet, sondern als Job in die
Datenbank geschrieben. Ein Worker-Pool (`internal/ai/worker.go`) zieht Jobs, ruft
den konfigurierten Provider auf und schreibt das extrahierte Rezept zurück.

Der Pool bringt mit, was ein solcher Aufbau in der Praxis braucht: begrenzte
Nebenläufigkeit, Wiederholungen mit Versuchszähler, und einen Reset für verwaiste
Jobs — die entstehen, wenn ein Neustart mitten in der Verarbeitung passiert.
Ohne den bleiben Jobs für immer auf „in Arbeit" stehen.

## Nährwerte: gemessen statt geraten

Die Nährwertberechnung war ein eigenes Teilprojekt. Unter `backend/cmd/nutrition-eval`
liegt ein Harness, das mehrere Ansätze gegeneinander gemessen hat — von rein
deterministischer Berechnung über Chain-of-Thought bis zu Tool-Use, jeweils gegen
einen selbst erstellten Ground-Truth-Satz.

Die Messergebnisse und die daraus abgeleitete Entscheidung stehen in
`docs/superpowers/research/`. Der produktive Weg ist das, was in dieser Messung
gewonnen hat, nicht das, was sich am besten angehört hat.

## Tests

```bash
cd backend && go test ./...
```

56 Testfunktionen in vier Paketen, 62 Läufe inklusive Subtests. Keine laufende
Datenbank nötig.

## Lokal starten

```bash
cp backend/.env.example backend/.env      # Zugangsdaten eintragen
docker compose up -d postgres
cd backend && go run .
```

Die Migrationen laufen beim Start des Backends automatisch (`goose.Up` in `main.go`).

Frontend:

```bash
cp frontend/.env.local.example frontend/.env.local
cd frontend && npm install && npm run dev
```

## Zur Arbeitsweise

`docs/superpowers/` enthält die Spezifikationen, Pläne und Messergebnisse dieses
Projekts — datiert und **vor** der jeweiligen Implementierung entstanden, mit den
getroffenen Entscheidungen und ihrer Begründung. `CLAUDE.md` hält die
Projektkonventionen fest, nach denen gearbeitet wurde.

Ich arbeite mit Coding-Agenten und lege offen, wie: erst Spezifikation, dann Plan,
dann Umsetzung, dann Messung. Die `Co-Authored-By`-Trailer in den Commits sind aus
demselben Grund nicht herausgeputzt worden.

## Zu diesem Repository

Öffentliche Kopie eines privaten Projekts, Stand Juli 2026, mit vollständiger
Historie. Einzelne Dateien sind aus Größen- und Lizenzgründen nicht enthalten.

## Lizenz

MIT
