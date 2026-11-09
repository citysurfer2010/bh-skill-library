// Tiny MCP server for the tests: shows which HOME it received.
import readline from "node:readline";
const send = (m) => process.stdout.write(`${JSON.stringify(m)}\n`);
readline.createInterface({ input: process.stdin }).on("line", (l) => {
  const { id, method, params } = JSON.parse(l);
  if (method === "initialize") send({ jsonrpc: "2.0", id, result: {} });
  else if (method === "tools/list") send({ jsonrpc: "2.0", id, result: { tools: [{ name: "a.who", description: "d", inputSchema: {} }] } });
  else if (method === "tools/call") send({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: `${params.name}:${process.env.HOME}:${process.env.SECRET_LEAK || ""}` }] } });
});
