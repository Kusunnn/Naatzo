const { types } = require('pg');
const { createDatabase } = require('../../../db/createDatabase');
const env = require('../config/env');
types.setTypeParser(1082, value => value);
module.exports = createDatabase({ connectionString: env.DATABASE_URL,
  ssl: env.DATABASE_SSL ? { rejectUnauthorized: false } : false, schema: env.DB_SCHEMA });
