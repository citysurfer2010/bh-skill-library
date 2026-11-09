import sharp from "sharp";

const WIDTH = 1920; const HEIGHT = 1080;
const xml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));

/** Wraps at word boundaries and limits the line count, so that nothing runs off the image. */
export function wrap(text, perLine, maxLines) {
  const lines = [];
  for (const para of String(text || "").split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const piece = word.slice(0, perLine);
      if (line && line.length + 1 + piece.length > perLine) { lines.push(line); line = piece; } else line = line ? `${line} ${piece}` : piece;
    }
    if (line) lines.push(line);
  }
  return lines.slice(0, maxLines);
}

export function screenSvg({ title, text }) {
  const big = wrap(title, 16, 3); const small = wrap(text, 48, 4);
  const total = big.length * 200 + small.length * 80 + (small.length ? 40 : 0);
  let y = (HEIGHT - total) / 2;
  const rows = [];
  for (const l of big) { y += 200; rows.push(`<text x="960" y="${y - 40}" font-size="170" font-weight="bold" fill="#e6eefc">${xml(l)}</text>`); }
  if (small.length) y += 40;
  for (const l of small) { y += 80; rows.push(`<text x="960" y="${y - 16}" font-size="60" fill="#9fb2d1">${xml(l)}</text>`); }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}"><rect width="100%" height="100%" fill="#0b1730"/><g font-family="DejaVu Sans" text-anchor="middle">${rows.join("")}</g></svg>`;
}

export const screenJpeg = (content) => sharp(Buffer.from(screenSvg(content))).jpeg({ quality: 88 }).toBuffer();
