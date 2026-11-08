// Fuehrt die Werkzeuge aller Server zusammen. Oeffentlicher Name: <server>_<werkzeug>,
// Sonderzeichen werden zu "_", weil Modell-APIs Punkte in Namen ablehnen.
const clean = (name) => name.replace(/[^a-zA-Z0-9_-]/g, "_");
// Ohne users-Liste steht ein Server allen offen; mit Liste nur den Genannten.
// Dienst-Konten (bh-*) bekommen nur ausdruecklich freigegebene Server: Jeder andere waere ein unnoetiger Prozess.
const isService = (user) => user.startsWith("bh-");
const allowed = (server, user) => (server.users ? server.users.includes(user) : !isService(user));

export class Registry {
  constructor(servers, pool) {
    this.servers = servers;
    this.pool = pool;
    this.routes = new Map();
    this.schemas = new Map();
  }

  async load(user, server) {
    if (this.schemas.has(server.id)) return;
    const { tools } = await this.pool.get(user, server).request("tools/list", {});
    this.schemas.set(server.id, tools.map((t) => {
      const name = `${server.id}_${clean(t.name)}`;
      this.routes.set(name, { server, tool: t.name });
      return { ...t, name };
    }));
  }

  async list(user) {
    const mine = this.servers.filter((s) => allowed(s, user));
    await Promise.all(mine.map((s) => this.load(user, s).catch((e) => console.error(`[registry] ${s.id}: ${e.message}`))));
    return mine.flatMap((s) => this.schemas.get(s.id) || []);
  }

  async call(user, name, args) {
    if (!this.routes.has(name)) await this.list(user);
    const route = this.routes.get(name);
    if (!route || !allowed(route.server, user)) throw Object.assign(new Error(`Unbekanntes Werkzeug: ${name}`), { code: -32601 });
    return this.pool.get(user, route.server).request("tools/call", { name: route.tool, arguments: args });
  }
}
