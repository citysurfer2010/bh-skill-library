# BH Platform: Server-Einrichtung

Ein Container je User mit opencode und direktem Terminal. User bekommen auf dem VPS
kein Konto; ihr SSH-Schluessel gilt nur fuer ihren eigenen Container.

## Bedienung (als root auf dem VPS)

    devbox add <name> <pubkey-datei>     # gibt den ssh-Befehl fuer den User aus
    devbox list
    devbox set-key <name> <pubkey-datei>
    devbox rotate-llm-token <name>
    devbox recreate <name>|--all         # nach neuem Image, Home bleibt
    devbox remove <name> [--purge]       # ohne --purge bleiben die Daten

Neues Image / geaenderte Host-Dateien: Ordner nach `/opt/devbox-src` ausrollen, `./setup.sh`,
danach `devbox recreate --all`. Test von aussen: `test/smoke.sh <admin-key>`.

## Grenzen

| Ebene | Massnahme |
|---|---|
| Zugang | sshd im Container als uid 1000, nur Schluessel; je User ein Port ab 2201 |
| Prozess | keine Capabilities, no-new-privileges, keine setuid-Dateien, kein sudo, Root-FS read-only |
| Host | userns-remap: uid 1000 im Container ist uid 101000 auf dem Host, root dort unprivilegiert |
| Netz | je User ein Netz; `devbox-firewall` sperrt Host, private Netze, Metadaten, SMTP |
| Ressourcen | je User 2,5 GB RAM, 0,9 CPU, 512 Prozesse, 10 GB eigenes Dateisystem (ueberschreibbar per `DEVBOX_*`) |

Gemeinsame Dienste werden per `docker network connect` in die User-Netze gehaengt, `llm-gateway` und
`mcp-gateway` automatisch. Bekannte Grenze: userns-remap nutzt fuer alle Container dieselbe
uid-Abbildung; ein Kernel-Ausbruch waere vom Host getrennt, aber nicht von den anderen Usern.

Docker-veroeffentlichte Ports umgehen UFW. Neue `-p`-Freigaben sind daher sofort oeffentlich.

## GitHub

Host: Zugriff auf `bh-skill-library` per Deploy-Key `/root/.ssh/bh_skill_library` (`~/.ssh/config`).
Container: `gh` ist vorinstalliert. Jeder User meldet sich selbst an, gespeichert wird im eigenen Home:

    gh auth login        # GitHub.com, HTTPS, "Login with a web browser"
    gh auth setup-git
    git config --global user.name "..." ; git config --global user.email "..."

## Skills

`/opt/bh-skill-library` aktualisiert sich stuendlich (`bh-skills-sync.timer`) und ist schreibgeschuetzt in jedem Container eingehaengt.

## Gateways

`gateway/setup-gateway.sh` startet das LLM-Gateway (Tageslimit 10 EUR), `gateway/setup-mcp-gateway.sh` das MCP-Gateway.
Beide haben keine veroeffentlichten Ports. Jeder User bekommt beim Anlegen ein Token, das fuer beide gilt.

## Geheimnisse

Tokens und Passwoerter stehen ausschliesslich in `/srv/bh-platform/.env` (root, Rechte 600), nie in Einzeldateien
oder im Repo. Setup-Skripte erzeugen daraus je Dienst nur die Werte, die er braucht. Enthalten sind
`CLOUDFLARE_API_TOKEN`, `MELIOUS_API_KEY`, `LLM_PROXY_TOKEN`.
