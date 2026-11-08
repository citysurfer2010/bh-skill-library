// Nimmt das GitHub-Token eines Users entgegen, ohne dass es durch ein Modell laeuft.
import { mkdirSync, writeFileSync, renameSync } from "node:fs";
import path from "node:path";

export async function storeGithubToken(home, token, fetchImpl = fetch) {
  if (typeof token !== "string" || !/^[\w-]{20,255}$/.test(token)) return { status: 400, error: "Token ungueltig" };
  const r = await fetchImpl("https://api.github.com/user", { headers: { authorization: `Bearer ${token}`, "user-agent": "bh-mcp-gateway" } });
  if (!r.ok) return { status: 400, error: "GitHub lehnt das Token ab" };
  const { login } = await r.json();
  const dir = path.join(home, ".config", "bh-github");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, "token");
  writeFileSync(`${file}.new`, token, { mode: 0o600 });
  renameSync(`${file}.new`, file);
  return { status: 200, login };
}
