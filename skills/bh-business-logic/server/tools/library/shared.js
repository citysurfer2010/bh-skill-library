const path = require('path');
const { createLibrary } = require('../../lib/library.js');
module.exports = createLibrary(path.join(__dirname, '../../../topics'));
