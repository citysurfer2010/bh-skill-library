import { createApp } from "../server.js";
import { openDb } from "../lib/db.js";

export async function startApp() {
  process.env.TRUST_PROXY_AUTH = "1";
  const server = createApp({ db: openDb(":memory:") }).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (path, { as, role, method = "GET", body } = {}) =>
    fetch(base + path, {
      method,
      headers: {
        ...(as ? { "x-user-email": as } : {}),
        ...(role ? { "x-user-role": role } : {}),
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  return { call, close: () => new Promise((r) => server.close(r)) };
}
