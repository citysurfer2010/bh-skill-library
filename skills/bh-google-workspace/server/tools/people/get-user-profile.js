'use strict';
const { apiErr, gapiJSON, ok } = require('../../lib/gapi.js');

const PERSON_FIELDS = 'names,emailAddresses,phoneNumbers,organizations,photos';

module.exports = { name: 'people.getUserProfile', description: 'Returns the Google profile of another person.', inputSchema: { type: 'object', properties: { resourceName: { type: 'string', description: 'Person resource name, e.g. "people/c12345"' } }, required: ['resourceName'] },
  handler: async ({ resourceName }) => {
  const r = await gapiJSON('GET', `https://people.googleapis.com/v1/${resourceName}?personFields=${PERSON_FIELDS}`);
  if (r.status !== 200) return apiErr('people.getUserProfile', r.status, r.data);
  const p = r.data;
  const name  = p.names?.[0]?.displayName || '?';
  const email = p.emailAddresses?.[0]?.value || '?';
  return ok(`Name: ${name}\nE-Mail: ${email}`);},
};
