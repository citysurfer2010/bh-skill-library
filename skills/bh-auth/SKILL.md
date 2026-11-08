---
name: bh-auth
description: Zentraler Anmeldedienst der BH Platform mit Login-Seite, Google-Login fuer eingeladene Adressen und Benutzerverwaltung. Nutzen, wenn eine App Anmeldung braucht oder Benutzer verwaltet werden.
---

# Skill: BH Auth

## Zweck

Eigener Anmeldedienst fuer alle BH-Apps: Passwort und Google (auch private Konten), Benutzerverwaltung,
Einladungen per Einmal-Link. Zugang haben ausschliesslich eingeladene Adressen.

## Anbindung einer App

Apps pruefen keine Sitzungen selbst. Der Proxy fragt den Dienst und reicht die Kopfzeilen weiter:

```nginx
location = /_auth { internal; proxy_pass http://bh-auth:3337/auth-headers; proxy_pass_request_body off; proxy_set_header Content-Length ""; }
location / {
  auth_request /_auth;
  auth_request_set $u_email $upstream_http_x_auth_email;
  auth_request_set $u_name  $upstream_http_x_auth_name;
  auth_request_set $u_role  $upstream_http_x_auth_role;
  proxy_set_header X-User-Email $u_email;
  proxy_set_header X-User-Name  $u_name;
  proxy_set_header X-User-Role  $u_role;
  proxy_pass http://meine-app:3000;
  error_page 401 = @login;
}
```

Die App lauscht nur intern und setzt `TRUST_PROXY_AUTH=1` (Skill `bh-webapp-skeleton`).

## Regeln

- Neue Benutzer nur ueber die Verwaltung `/admin` einladen. Google legt nie selbst Konten an.
- Einladungslinks gelten 72 Stunden, Passwort-Links 1 Stunde, jeweils einmal.
- Der Signierschluessel bleibt in diesem Dienst, andere Apps bekommen ihn nie.
- In Produktion immer `PUBLIC_URL` mit https, sonst sind Sitzungs-Cookies nicht geschuetzt.

## Betrieb

| Aufgabe | Befehl auf dem Server |
|---|---|
| Einrichten | `platform/auth/setup-auth.sh` |
| Ersten Admin anlegen | `docker exec bh-auth node bin/invite-admin.js <email> <name>` |
| Konfiguration | `BH_PUBLIC_URL`, `BH_COOKIE_DOMAIN`, `GOOGLE_*` in `/srv/bh-platform/.env` |

Google-Login: OAuth-Client vom Typ Webanwendung, Weiterleitung `<PUBLIC_URL>/oauth/google/callback`,
Bereiche nur `openid email profile`, Nutzertyp Extern. Dann `GOOGLE_CLIENT_ID` und `GOOGLE_CLIENT_SECRET` in die
Konfiguration eintragen und das Setup erneut ausfuehren.
