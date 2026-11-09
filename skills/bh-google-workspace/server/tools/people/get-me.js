'use strict';
const { apiErr, gapiJSON, ok } = require('../../lib/gapi.js');

const PERSON_FIELDS = 'names,emailAddresses,phoneNumbers,organizations,photos';

module.exports = {
  name: 'people.getMe',
  description: "Returns the own Google profile (name, email, phone, organization, photo URL). " +
    "format='text' (default) = human-readable; format='raw' = JSON-stringified Google-People-Response " +
    "(needed by app callers that use photos[].url for avatar loading).",
  inputSchema: {
    type: 'object',
    properties: {
      format: { type: 'string', enum: ['text', 'raw'], description: "'text' (default) = formatted; 'raw' = JSON for app callers" },
    },
  },
  handler: async (args) => {
    const r = await gapiJSON('GET', `https://people.googleapis.com/v1/people/me?personFields=${PERSON_FIELDS}`);
    if (r.status !== 200) return apiErr('people.getMe', r.status, r.data);
    const p = r.data;
    if (args?.format === 'raw') {
      return ok(JSON.stringify({
        names:          p.names          || [],
        emailAddresses: p.emailAddresses || [],
        phoneNumbers:   p.phoneNumbers   || [],
        organizations:  p.organizations  || [],
        photos:         p.photos         || [],
      }));
    }
    const name  = p.names?.[0]?.displayName || '?';
    const email = p.emailAddresses?.[0]?.value || '?';
    const phone = p.phoneNumbers?.[0]?.value || '?';
    const org   = p.organizations?.[0]?.name || '?';
    return ok(`Name: ${name}\nE-Mail: ${email}\nTelefon: ${phone}\nOrganisation: ${org}`);
  },
};
