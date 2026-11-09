const path = require('path');
const { createLibrary } = require('../../../../bh-business-logic/server/lib/library.js');
module.exports = createLibrary(path.join(__dirname, '../../../actions'));
