'use strict';
const { apiErr, gapiJSON, ok } = require('../../lib/gapi.js');

module.exports = { name: 'slides.getMetadata', description: 'Gibt Metadaten einer Google Slides Präsentation zurück.', inputSchema: { type: 'object', properties: { presentationId: { type: 'string' } }, required: ['presentationId'] },
  handler: async ({ presentationId }) => {
  const r = await gapiJSON('GET', `https://slides.googleapis.com/v1/presentations/${presentationId}`);
  if (r.status !== 200) return apiErr('slides.getMetadata', r.status, r.data);
  const slides = (r.data.slides || []).length;
  return ok(`Titel: ${r.data.title}\nID: ${r.data.presentationId}\nAnzahl Folien: ${slides}`);},
};
