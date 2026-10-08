const { createDatabase } = require('./createDatabase');
const { databaseSsl, databaseUrl } = require('../config/env');
module.exports = createDatabase({ connectionString: databaseUrl, ssl: databaseSsl });
