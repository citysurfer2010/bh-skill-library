'use strict';
const { apiErr, gapiJSON, ok } = require('../../lib/gapi.js');

module.exports = { name: 'slides.getText', description: 'Liest den Text-Inhalt aller Folien einer Google Slides Präsentation.', inputSchema: { type: 'object', properties: { presentationId: { type: 'string' } }, required: ['presentationId'] },
  handler: async ({ presentationId }) => {
  const r = await gapiJSON('GET', `https://slides.googleapis.com/v1/presentations/${presentationId}`);
  if (r.status !== 200) return apiErr('slides.getText', r.status, r.data);
  const texts = [];
  for (const slide of (r.data.slides || [])) {
    for (const el of (slide.pageElements || [])) {
      const shape = el.shape?.text?.textElements;
      if (shape) {
        for (const te of shape) {
          if (te.textRun?.content) texts.push(te.textRun.content);
        }
      }
    }
    texts.push('\n---\n');
  }
  return ok(texts.join('').substring(0, 8000));},
};
