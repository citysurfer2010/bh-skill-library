import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

// Der Signierschluessel gehoert nur diesem Dienst: Andere Apps fragen /auth-headers.
function sessionKey(dataDir) {
  const file = path.join(dataDir, ".session-key");
  if (!existsSync(file)) writeFileSync(file, randomBytes(48), { mode: 0o600, flag: "wx" });
  return new Uint8Array(readFileSync(file));
}

export function loadConfig(env = process.env) {
  const publicUrl = (env.PUBLIC_URL || "http://localhost:3337").replace(/\/$/, "");
  const dataDir = env.DATA_DIR || "./data";
  mkdirSync(dataDir, { recursive: true });
  const google = env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
    ? { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } : null;
  return {
    publicUrl, dataDir, google,
    port: Number(env.PORT || 3337),
    cookieDomain: env.AUTH_COOKIE_DOMAIN || undefined,
    screenRead: env.SCREEN_READ || "",
    screenWrite: env.SCREEN_WRITE || "",
    returnOrigins: (env.RETURN_ORIGINS || "").split(/\s+/).filter(Boolean),
    secure: publicUrl.startsWith("https://"),
    key: sessionKey(dataDir),
    fetch: globalThis.fetch,
  };
}
