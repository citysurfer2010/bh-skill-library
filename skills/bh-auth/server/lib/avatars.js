import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 2 * 1024 * 1024;

/** Only real Google profile pictures, so that the server never fetches arbitrary addresses. */
export function pictureUrl(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || !/^lh\d+\.googleusercontent\.com$/.test(u.hostname)) return null;
    return u.href.replace(/=s\d+(-c)?$/, "=s256-c");
  } catch { return null; }
}

// The image is stored here: showing it does not tell Google who opens the page and when.
export function avatarStore(config, users) {
  const dir = path.join(config.dataDir, "avatars");
  const file = (id) => path.join(dir, id);
  return {
    /** A missing image must never disrupt the login. */
    async fromGoogle(userId, url) {
      const href = pictureUrl(url);
      if (!href) return;
      try {
        const r = await config.fetch(href, { redirect: "error", signal: AbortSignal.timeout(8000) });
        const type = (r.headers.get("content-type") || "").split(";")[0].trim();
        if (!r.ok || !TYPES.has(type)) return;
        const body = Buffer.from(await r.arrayBuffer());
        if (!body.length || body.length > MAX_BYTES) return;
        mkdirSync(dir, { recursive: true, mode: 0o700 });
        writeFileSync(file(userId), body, { mode: 0o600 });
        users.setAvatar(userId, type);
      } catch (e) { console.error(`[avatar] ${e.message}`); }
    },
    read: (user) => readFileSync(file(user.id)),
    remove(user) {
      rmSync(file(user.id), { force: true });
      users.clearAvatar(user.id);
    },
  };
}
