# BH Amazon: Bekannte Grenzen

- Amazon untersagt automatisiertes Auslesen in seinen Nutzungsbedingungen; Matti hat sich bewusst dafür entschieden. Bei Captchas oder Sperren den Abruf aussetzen.
- Die Seitenleser sind auf Textmuster gebaut; die Anmeldeseite wurde am 15.11.2026 an der echten Seite justiert (E-Mail `#ap_email_login`, Formular `#ap_login_form`), die Zahlungsseite noch nicht.
- Der hinterlegte Zugang ist ein vollwertiger Amazon-Zugang auf dem Server (nur im Container `bh-amazon` lesbar).
- Ändert Amazon die Seiten, kann der Abruf brechen; Tests prüfen nur die Textleser.
- Nur amazon.de; andere Länder-Shops nicht.
- Der Container braucht Internetzugang nach außen (amazon.de).
