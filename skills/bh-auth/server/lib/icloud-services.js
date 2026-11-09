// Passes a user's iCloud login to the gateway. It is not stored here and never logged.
const gatewayUser = (user) => String(user.email || "").split("@")[0].toLowerCase();
const STORE_TIMEOUT_MS = 30_000; // The gateway checks the login with Apple first.

function post(config, path, body, timeout = 5000) {
  return config.fetch(`${config.connect.url}${path}`, { method: "POST", headers: { "x-connect-secret": config.connect.secret, "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeout) });
}

const clean = (value) => String(value || "").trim();

// Pasted passwords may come with spaces, capitals or without the dashes.
function appPassword(value) {
  const raw = String(value || "").replace(/\s/g, "").toLowerCase();
  return /^[a-z]{16}$/.test(raw) ? raw.match(/.{4}/g).join("-") : raw;
}

/** { ok: true } or { ok: false, error }; error is a text the user can read. */
export async function storeIcloud(config, user, form) {
  try {
    const r = await post(config, "/connect/icloud", { user: gatewayUser(user), appleId: clean(form.appleId), password: appPassword(form.password), mailUser: clean(form.mailUser) }, STORE_TIMEOUT_MS);
    if (r.ok) return { ok: true };
    return { ok: false, error: (await r.json()).error || "iCloud konnte nicht verbunden werden." };
  } catch { return { ok: false, error: "iCloud konnte nicht verbunden werden. Bitte versuche es noch einmal." }; }
}

export async function removeIcloud(config, user) {
  try { return (await post(config, "/connect/icloud/remove", { user: gatewayUser(user) })).ok; } catch { return false; }
}

/** { connected, appleId, rejected }; null if the gateway does not answer or nothing is set up. */
export async function icloudStatus(config, user) {
  if (!config.connect.secret) return null;
  try {
    const r = await post(config, "/connect/icloud/status", { user: gatewayUser(user) });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}
