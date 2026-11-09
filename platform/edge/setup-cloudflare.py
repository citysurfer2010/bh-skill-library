#!/usr/bin/env python3
"""Sets up DNS and the tunnel at Cloudflare (idempotent). Values from /srv/bh-platform/.env."""
import json
import re
import urllib.error
import urllib.request

ENV = "/srv/bh-platform/.env"
API = "https://api.cloudflare.com/client/v4"
TUNNEL = "bh-platform"
EDGE = "http://bh-edge:8080"


def read_env():
    return dict(l.rstrip("\n").split("=", 1) for l in open(ENV) if "=" in l and not l.startswith("#"))


def set_env(key, value):
    text = open(ENV).read()
    line = f"{key}={value}"
    text = re.sub(rf"^{key}=.*$", lambda _: line, text, flags=re.M) if re.search(rf"^{key}=", text, re.M) else text + line + "\n"
    open(ENV, "w").write(text)


env = read_env()
domain = env["EDGE_DOMAIN"]
hosts = [f"auth.{domain}", f"apps.{domain}", f"*.{domain}"]


def api(method, path, body=None):
    req = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers={
        "Authorization": f"Bearer {env['CLOUDFLARE_API_TOKEN']}", "Content-Type": "application/json", "User-Agent": "bh-platform-setup"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.load(r)["result"]
    except urllib.error.HTTPError as e:
        raise SystemExit(f"{method} {path}: HTTP {e.code} {e.read()[:300].decode()}")


zone = api("GET", f"/zones?name={domain}")[0]
zid, account = zone["id"], zone["account"]["id"]
records = api("GET", f"/zones/{zid}/dns_records?per_page=100")


def ensure(rtype, name, content, proxied):
    match = [r for r in records if r["type"] == rtype and r["name"] == name]
    body = {"type": rtype, "name": name, "content": content, "proxied": proxied, "ttl": 1}
    if match and match[0]["content"] == content and match[0]["proxied"] == proxied:
        return
    if match:
        api("PUT", f"/zones/{zid}/dns_records/{match[0]['id']}", body)
    else:
        api("POST", f"/zones/{zid}/dns_records", body)
    print("gesetzt:", rtype, name)


# Everything existing stays as it is: DNS only, no Cloudflare proxy (mail, Autodiscover).
for r in records:
    if r["proxied"] and r["name"] not in hosts:
        api("PATCH", f"/zones/{zid}/dns_records/{r['id']}", {"proxied": False})
        print("nur DNS:", r["type"], r["name"])

for pair in env.get("BH_DKIM", "").split():
    selector, target = pair.split("=", 1)
    ensure("CNAME", f"{selector}._domainkey.{domain}", target, False)

found = api("GET", f"/accounts/{account}/cfd_tunnel?is_deleted=false&name={TUNNEL}")
tunnel = found[0] if found else api("POST", f"/accounts/{account}/cfd_tunnel", {"name": TUNNEL, "config_src": "cloudflare"})
tid = tunnel["id"]
api("PUT", f"/accounts/{account}/cfd_tunnel/{tid}/configurations", {"config": {"ingress": [
    *[{"hostname": h, "service": EDGE} for h in hosts], {"service": "http_status:404"}]}})
for h in hosts:
    ensure("CNAME", h, f"{tid}.cfargotunnel.com", True)
set_env("CLOUDFLARE_TUNNEL_TOKEN", api("GET", f"/accounts/{account}/cfd_tunnel/{tid}/token"))
print("Tunnel bereit:", TUNNEL, "| Nameserver:", " ".join(zone["name_servers"]), "| Zone:", zone["status"])
