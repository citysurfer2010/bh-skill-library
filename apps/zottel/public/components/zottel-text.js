'use strict';
/** Renders the assistant's text: paragraphs, lists, code, bold and safe links. Everything is escaped first. */
window.ZottelText = (() => {
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function inline(text) {
    return esc(text)
      .replace(/`([^`\n]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
  }

  function block(part) {
    const lines = part.split('\n');
    if (lines.every((l) => /^\s*[-*•]\s+/.test(l))) return `<ul>${lines.map((l) => `<li>${inline(l.replace(/^\s*[-*•]\s+/, ''))}</li>`).join('')}</ul>`;
    if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) return `<ol>${lines.map((l) => `<li>${inline(l.replace(/^\s*\d+[.)]\s+/, ''))}</li>`).join('')}</ol>`;
    const head = /^#{1,4}\s+(.*)$/.exec(part);
    if (head && lines.length === 1) return `<h3>${inline(head[1])}</h3>`;
    return `<p>${lines.map(inline).join('<br>')}</p>`;
  }

  function render(text) {
    return String(text || '').split(/(```[\s\S]*?```)/g).map((chunk) => {
      const code = /^```[^\n]*\n?([\s\S]*?)```$/.exec(chunk);
      if (code) return `<pre><code>${esc(code[1])}</code></pre>`;
      return chunk.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean).map(block).join('');
    }).join('');
  }

  return { render };
})();
