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
| Hover der Hauptaktion | `--bh-primary-hover` | `#1e40af` | `#93c5fd` |
| Gefüllte Hauptaktion / Schrift | `--bh-action` / `--bh-on-action` | `#1d4ed8` / `#ffffff` | `#2563eb` / `#ffffff` |
| Läuft, aktiv | `--bh-warm` / `-soft` | `#c2410c` / `#ffedd5` | `#fb923c` / `#4a2a1c` |
| Getönte Fläche | `--bh-primary-soft` | `#dbeafe` | `#1e3a8a` |
| Rahmen getönter Flächen | `--bh-primary-border` | `#93b4ee` | `#2f5aa8` |
| Navbar | `--bh-navbar` | `#1d4ed8` | `#1e40af` |
| Schrift auf der Navbar | `--bh-on-navbar` | `#ffffff` | `#ffffff` |
| Akzent aktiver Tab | `--bh-navbar-accent` | `#bfdbfe` | `#bfdbfe` |
| Seitenhintergrund | `--bh-bg` | `#f5f8fe` | `#0b1730` |
| Karten, Panels, Seitenkopf | `--bh-surface` | `#ffffff` | `#12233f` |
| Hover, Zebra, Brotkrumen dunkel | `--bh-bg-subtle` | `#ecf2fc` | `#172c4d` |
| Text | `--bh-text` | `#0f1f3d` | `#e6eefc` |
| Nebentext | `--bh-muted` | `#566583` | `#9fb2d1` |
| Platzhalter | `--bh-placeholder` | `#7a88a3` | `#7f94b8` |
| Linien | `--bh-border` | `#d6e0f2` | `#27406a` |
| Feldrahmen, Kachelrahmen | `--bh-input-border` | `#b4c3de` | `#3b5a8d` |
| Gefahr | `--bh-danger` / `-bg` | `#b91c1c` / `#fef2f2` | `#fca5a5` / `#3a1a22` |
| Warnung | `--bh-warn` / `-bg` | `#92590a` / `#fff8e6` | `#fcd34d` / `#33290f` |
| Information | `--bh-info` / `-bg` | `#1d4ed8` / `#eff5ff` | `#93c5fd` / `#16305c` |
| Erfolg | `--bh-ok` / `-bg` | `#15803d` / `#edf9f1` | `#86efac` / `#12331f` |
| KI-Aktionen | `--bh-magic` / `-bg` | `#6d28d9` / `#f3effe` | `#c4b5fd` / `#2a2150` |

**Verlauf:** Weiche, helle Verläufe nur für große Bühnenflächen: das Band oben in der App (`--bh-hero-idle`, Blau über Lila zu warmem Pfirsich) und das Startbild auf dem Beamer. Die Navbar bleibt immer einfarbig, nie Verlauf auf Knöpfen oder Text.

**Bedeutung ist fest vergeben:** Blau ist Aktion und Marke, Grün Erfolg, Gelb Warnung, Rot Gefahr, Orange (`--bh-warm`) heißt „läuft gerade/aktiv“. Violett und Orange sind als Verlaufsfarben frei; als Knopf bleibt Violett (`bh-btn-magic`) ausschließlich KI vorbehalten.

## Teil 3: Form und Schrift

**Ecken:** 6 px für Bedienelemente und Schilder (`--bh-radius-sm`), 8 px für Flächen und Menüs (`--bh-radius`), 12 px für große Flächen (`--bh-radius-lg`). Keine Pillen, auch nicht für Knöpfe. Rund sind nur Avatare und die OK-Taste im Steuerkreuz einer Fernbedienung.

**Schrift:** Systemschrift über `--bh-font`.

| Element | Größe | Gewicht |
|---|---|---|
| Seitentitel | 24 px | 700 |
| Titel im Band einer App | 28 px | 700 |
| Abschnittsüberschrift | 18 px | 600 |
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

Jede Oberfläche unterstützt Hell und Dunkel. Ohne gespeicherte Wahl gilt die Einstellung des Geräts; die Wahl des Nutzers wird unter `bh-theme` gespeichert und vor dem ersten Zeichnen gesetzt. Inline-Styles dürfen keine festen Farben enthalten.

- **Umschalten:** Sonne/Mond direkt in der Navbar, immer sichtbar, zusätzlich „Design: Hell/Dunkel“ im Benutzermenü. Beide bleiben synchron.
- **Ebenen von hinten nach vorn:** Seite `--bh-bg`, Flächen `--bh-surface`, Hover und Brotkrumen `--bh-bg-subtle`. Zwei benachbarte Ebenen haben nie denselben Farbton.
- **Navbar bleibt einfarbig kräftig blau** mit weißer Schrift. Sie darf nie die Farbe einer Fläche annehmen, sonst verschwindet sie.
- **Gefüllte Hauptaktion:** `--bh-action` mit weißer Schrift, im Dunkeln `#2563eb`. Das helle `--bh-primary` nur für Links und Akzente.
- **Kontrast:** Text mindestens 4,5:1, Rahmen von Bedienelementen über `--bh-input-border`.

## Aufbau einer App

Jede App hat von oben nach unten dieselben Zonen. Sie entstehen über `BHAppShell`, nie von Hand.

| Zone | Inhalt | Regel |
|---|---|---|
| **Navbar** (52 px, `--bh-navbar`) | Links BH-Kachel und App-Name, dahinter Tabs. Rechts Hell/Dunkel, Admin-Zahnrad (nur Admins), Benutzermenü | Tabs erst ab zwei Seiten. Keine Seitenknöpfe |
| **Benutzermenü** | Name und Rolle, App-Übersicht, Mein Profil, Design, Abmelden | In jeder App gleich |
| **Brotkrumen** (`AppShell.crumbs`) | `Apps › App › Seite`, erster Eintrag führt zur App-Übersicht | Immer vorhanden, 13 px |
| **Seitenkopf** (`.app-topbar`) | Links Titel (24 px) und Status, rechts die Hauptaktion | Höchstens ein Hauptknopf |
| **Hinweisbalken** | Warnung oder Zustand, der die ganze Seite betrifft | Nur wenn nötig, `--bh-warn-bg` |
| **Sidebar** | Unterseiten einer App, einklappbar | Nur bei mehreren Bereichen |
| **Inhalt** | Abschnitte mit Überschrift (18 px, 600), volle Breite | Reine Formularseiten höchstens 760 px |

**Linke Kante:** Logo, Brotkrumen, Titel und Inhalt fluchten (24 px, am Handy 12 px).

**Handy (bis 960 px):** eine Spalte, das Wichtigste zuerst, Tippflächen mindestens 44 px, Felder 16 px. Kein waagerechter Überstand.

**Zustände:** Jede Aktion zeigt sofort, was passiert: lädt (`aria-busy`), Erfolg oder Fehler als Toast, aktiver Inhalt mit Rahmen und Text „Läuft“, nie allein über Farbe. Daten laden mit Platzhalter (`AppShell.loading`), leere Listen mit `.empty`.

## Teil 5: Qualitätscheckliste

**Prüfung ist Pflicht:** Jede sichtbare Änderung prüfen ein UI/UX-Agent und ein Design-Experte getrennt, mit Screenshots in Hell, Dunkel, 390 px und mit echtem Zustand. Befunde umsetzen, erneut prüfen, bis beide freigeben. Ziel ist ein Erlebnis auf Weltklasse-Niveau, nicht „funktioniert“.

Vor jedem Commit:

- [ ] Mit `bh-webapp-skeleton` angelegt, alle Pflicht-Suiten grün
- [ ] Nur Tokens, keine festen Farben außerhalb von `tokens.css`
- [ ] Hell, Dunkel und 390 px Breite im Browser angesehen, kein waagerechter Überstand
- [ ] Zonen wie unter „Aufbau einer App“: Navbar, Brotkrumen, Seitenkopf, Inhalt
- [ ] Umschalter Hell/Dunkel sichtbar, Navbar und Brotkrumen in beiden Designs klar abgesetzt
- [ ] Knöpfe `bh-btn`, Felder `bh-field` mit `--bh-input-border`
- [ ] Jedes Dropdown `BHSelectCore`
- [ ] Kein `alert`, `confirm`, `prompt`
- [ ] Ecken 6, 8 oder 12 px, keine Pillen
- [ ] Keine Emojis, nur Inline-SVG
- [ ] Violett als Knopf nur für KI, Orange nur für „läuft/aktiv“
- [ ] Sichtbare Texte mit echten Umlauten
- [ ] Rollen geprüft: Was jemand nicht darf, wird nicht angezeigt

## Teil 6: Dokumente

Für Dokumente gibt es noch keine BH-Vorlage. Bis dahin: A4, Systemschrift oder Inter, Blau `#1d4ed8` für Marke, Überschriften und Akzentlinien, nummerierte Schritte, getönte Hinweiskästen und eine echte Fußzeile.
