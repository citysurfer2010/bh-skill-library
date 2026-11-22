# BH Amazon: Bekannte Grenzen

- Amazon untersagt automatisiertes Auslesen in seinen Nutzungsbedingungen; Matti hat sich bewusst dafür entschieden. Bei Captchas oder Sperren den Abruf aussetzen.
- Die Seitenleser sind auf Textmuster gebaut; die Anmeldeseite wurde am 15.11.2026 an der echten Seite justiert (E-Mail `#ap_email_login`, Formular `#ap_login_form`), die Zahlungsseite ebenfalls (Betrag englisch „-€12.74“, Datum in der Zeile, Zahlungsmittel vor „Bestellnummer“).
- Der hinterlegte Zugang ist ein vollwertiger Amazon-Zugang auf dem Server (nur im Container `bh-amazon` lesbar).
- Ändert Amazon die Seiten, kann der Abruf brechen; Tests prüfen nur die Textleser.
- Nur amazon.de; andere Länder-Shops nicht.
- Der Container braucht Internetzugang nach außen (amazon.de).

## Digitale Bestellungen (D01-…)
Prime Video verlinkt auf `/gp/video/detail/<ASIN oder amzn1.dv.gti.…>`, Abos (Prime-Gebühr, Music) auf `/dp/…?ref_=ppx_hzod…`; beides wird seit 22.11.2026 als Artikel gelesen. Bestellungen, die ohne Artikel gelesen wurden, fragt die Finanz-App höchstens einmal pro Woche erneut ab (je Lauf bis 60).
