---
name: bh-styleguide
description: Verbindlicher Style Guide der BH Platform mit Farben, Typografie, Ecken, Komponenten und Coding-Standards. Immer nutzen, wenn eine Oberfläche gebaut, geändert oder geprüft wird.
---

# Skill: BH Style Guide

Gilt für jede Oberfläche der BH Platform. Angelehnt an den bewährten Standard, den wir schon in unseren anderen Produkten nutzen; die Marke ist Blau.

**Quelle der Wahrheit:** `skills/bh-webapp-skeleton/templates/new-web-app/app/public/css/tokens.css`. Neue Apps entstehen immer mit dem Skill `bh-webapp-skeleton`.

## Teil 1: Arbeitsweise

Wer eine App baut, ändert oder prüft, arbeitet wie ein Lead-Architekt: skalierbar, testbar, für Menschen lesbar.

- **Modular:** Seiten und Komponenten trennen, eine Datei hat einen Zweck, Richtwert 200 Zeilen.
- **Tests zuerst:** Vor der Logik klären, welcher Test die Funktion dauerhaft schützt. Jeder neue Endpoint und jede Komponente bekommt einen Test.
- **In 30 Sekunden lesbar:** sprechende Namen, keine tiefen Verschachtelungen. Kommentare erklären das Warum.

Ablauf: Seiten und Komponenten planen, Dateien anlegen, Test schreiben, umsetzen, nächste Komponente.

## Teil 2: Farben

Nie Farben fest in den Code schreiben, immer die Tokens. Dunkel gilt automatisch über `html[data-theme="dark"]`.

| Zweck | Token | Hell | Dunkel |
|---|---|---|---|
| Marke, Hauptaktion, Links | `--bh-primary` | `#1d4ed8` | `#60a5fa` |
| Hover | `--bh-primary-hover` | `#1e40af` | `#93c5fd` |
| Getönte Fläche | `--bh-primary-soft` | `#dbeafe` | siehe tokens.css |
| Navbar | `--bh-navbar` | `#1d4ed8` | `#12233f` |
| Seitenhintergrund | `--bh-bg` | `#f5f8fe` | siehe tokens.css |
| Karten, Panels | `--bh-surface` | `#ffffff` | siehe tokens.css |
| Hover, Zebra | `--bh-bg-subtle` | `#ecf2fc` | `#172c4d` |
| Text | `--bh-text` | `#0f1f3d` | siehe tokens.css |
| Nebentext | `--bh-muted` | `#566583` | siehe tokens.css |
| Linien | `--bh-border` | `#d6e0f2` | siehe tokens.css |
| Feldrahmen | `--bh-input-border` | `#b4c3de` | siehe tokens.css |
| Gefahr | `--bh-danger` / `-bg` | `#b91c1c` | `#fca5a5` |
| Warnung | `--bh-warn` / `-bg` | `#92590a` | siehe tokens.css |
| Erfolg | `--bh-ok` / `-bg` | `#15803d` | siehe tokens.css |
| KI-Aktionen | `--bh-magic` / `-bg` | `#6d28d9` | `#c4b5fd` |

**Bedeutung ist fest vergeben:** Blau ist Aktion und Marke, Grün Erfolg, Gelb Warnung, Rot Gefahr. Violett steht ausschließlich für Knöpfe und Ladezustände, die einen KI-Aufruf auslösen, und wird sparsam eingesetzt.

## Teil 3: Form und Schrift

**Ecken:** 6 px für Bedienelemente und Schilder (`--bh-radius-sm`), 8 px für Flächen und Menüs (`--bh-radius`), 12 px für große Flächen (`--bh-radius-lg`). Keine Pillen, auch nicht für Knöpfe. Rund sind nur Avatare.

**Schrift:** Systemschrift über `--bh-font`.

| Element | Größe | Gewicht |
|---|---|---|
| Seitentitel | 24 px | 700 |
| Kartentitel | 16 px | 600 |
| Fließtext, Felder | 14 px | 400 |
| Nebentext | 13 px | 400 |
| Abschnittslabel | 11 bis 13 px, Großbuchstaben, gesperrt | 700 |
| Dichte Formulare: Felder / Labels / Hauptknopf | 11,5 / 11 / 13 px | 400 / 500 / 600 |

**Abstände:** Grundraster `--bh-gap` (16 px). **Höhe:** Bedienelemente 40 px (`--bh-control-h`), klein 32 px (`--bh-control-h-sm`).

**Icons:** Inline-SVG mit `currentColor`, Strichstärke 2. Keine Emojis in Oberflächen.

**Bewegung:** Nur Rückmeldung, höchstens 150 ms, immer mit `prefers-reduced-motion` abschaltbar.

## Teil 4: Komponenten

### Rahmen

Navbar und Benutzermenü folgen dem Standard im Skill `bh-webapp-skeleton`. Inhalte nutzen die volle Breite; nur reine Formularseiten wie das Profil werden auf etwa 760 px begrenzt. Rahmen: `BHAppShell.mount(...)`, in Apps über `Navbar.render(tab, me)`.

### Knöpfe

```html
<button class="bh-btn bh-btn-primary">Speichern</button>
<button class="bh-btn">Abbrechen</button>
<button class="bh-btn bh-btn-danger">Löschen</button>
<button class="bh-btn bh-btn-magic">KI-Vorschlag</button>
<button class="bh-btn bh-btn-primary bh-btn-sm">Klein</button>
```

Je Bereich höchstens ein Hauptknopf. Seitenknöpfe gehören in den Seitenkopf, nie in die Navbar.

### Formulare

```html
<div class="bh-field">
  <label class="bh-label bh-label-required">Titel</label>
  <input class="bh-input" type="text">
  <div class="bh-help">Erscheint in der Übersicht</div>
</div>
<div class="bh-form-actions">…</div>
```

Feldrahmen immer aus `--bh-input-border`, nie aus `--bh-border`, sonst ist nicht zu erkennen, wo man schreiben kann. Auf dem Handy Felder mit 16 px, damit iOS beim Fokus nicht zoomt.

### Dropdowns

Jedes Dropdown ist `BHSelectCore.create(host, { value, options, onChange, label })`. Kein natives `<select>` und kein `<datalist>` in sichtbarer Oberfläche.

### Listen und Tabellen

Listenseiten mit `BHListPage.render`, Tabellen mit `BHDataTable`, Details in `BHSideDrawer`. Kennzahlen, Suche und Filter stehen über der Tabelle.

### Karten, Leerzustände, Status

- Karte: `.card`
- Leerer Zustand: `.empty` mit einer Handlung, die weiterhilft
- Status: `.pill` (Ecke 6 px)
- Rückmeldung: `Toast.show(text, 'success' | 'error')`

### Bestätigen statt Pop-up

`alert`, `confirm` und `prompt` sind verboten. Zerstörende Aktionen fragen direkt in der Zeile nach, mit rotem Knopf „Ja, …“ und „Abbrechen“, wie beim Trennen im Profil. Ein eigener Dialog-Baustein fehlt noch und gehört bei Bedarf ins Skeleton.

### Dunkles Design

Jede Oberfläche unterstützt Hell und Dunkel. Das Design wird vor dem ersten Zeichnen gesetzt und unter `bh-theme` gespeichert. Inline-Styles dürfen keine festen Farben enthalten.

## Teil 5: Qualitätscheckliste

Vor jedem Commit:

- [ ] Mit `bh-webapp-skeleton` angelegt, alle Pflicht-Suiten grün
- [ ] Nur Tokens, keine festen Farben außerhalb von `tokens.css`
- [ ] Hell, Dunkel und 390 px Breite im Browser angesehen, kein waagerechter Überstand
- [ ] Standard-Navbar und Benutzermenü
- [ ] Knöpfe `bh-btn`, Felder `bh-field` mit `--bh-input-border`
- [ ] Jedes Dropdown `BHSelectCore`
- [ ] Kein `alert`, `confirm`, `prompt`
- [ ] Ecken 6, 8 oder 12 px, keine Pillen
- [ ] Keine Emojis, nur Inline-SVG
- [ ] Violett nur für KI
- [ ] Sichtbare Texte mit echten Umlauten
- [ ] Rollen geprüft: Was jemand nicht darf, wird nicht angezeigt

## Teil 6: Dokumente

Für Dokumente gibt es noch keine BH-Vorlage. Bis dahin: A4, Systemschrift oder Inter, Blau `#1d4ed8` für Marke, Überschriften und Akzentlinien, nummerierte Schritte, getönte Hinweiskästen und eine echte Fußzeile.
