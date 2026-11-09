// Reicht die Google-Freigabe an das Gateway weiter. Die Werkzeuge laufen dort, je User getrennt.
const gatewayUser = (user) => String(user.email || "").split("@")[0].toLowerCase();

function post(config, path, body) {
  return config.fetch(`${config.connect.url}${path}`, { method: "POST", headers: { "x-connect-secret": config.connect.secret, "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(5000) });
}

export async function storeServices(config, user, token, email = null) {
  const r = await post(config, "/connect/google", { user: gatewayUser(user), access_token: token.access_token, refresh_token: token.refresh_token, expires_in: token.expires_in, email, client_id: config.google.clientId, client_secret: config.google.clientSecret });
  return r.ok;
}

export async function removeServices(config, user) {
  try { return (await post(config, "/connect/google/remove", { user: gatewayUser(user) })).ok; } catch { return false; }
}

/** { connected, email }; null, wenn das Gateway nicht antwortet oder nichts eingerichtet ist. */
export async function servicesStatus(config, user) {
  if (!config.google || !config.connect.secret) return null;
  try {
    const r = await post(config, "/connect/google/status", { user: gatewayUser(user) });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}
