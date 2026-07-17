require("dotenv").config();

module.exports = {
  port: process.env.PORT || 4000,

  // Database configurations
  database: {
    // Direct database connection (for migrations, etc.)
    direct: {
      host: process.env.PGHOST,
      port: process.env.PGPORT,
      database: process.env.PGDATABASE,
      username: process.env.PGUSER,
      password: process.env.PGPASSWORD,
    },
    // PgBouncer connection (for application queries)
    pgbouncer: {
      host: process.env.PGBOUNCER_HOST,
      port: process.env.PGBOUNCER_PORT,
      database: process.env.PGDATABASE,
      username: process.env.PGUSER,
      password: process.env.PGPASSWORD,
    },
  },

  // Redis configuration
  redis: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
    password: process.env.REDIS_PASSWORD,
    db: process.env.REDIS_DB,
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    keepAlive: 30000,
    connectTimeout: 10000,
    commandTimeout: 5000,
  },

  // Prometheus metrics configuration
  metrics: {
    enabled: process.env.METRICS_ENABLED,
    port: process.env.METRICS_PORT,
    path: process.env.METRICS_PATH,
  },

  jwtSecret: process.env.JWT_SECRET,
  emailService: {
    provider: process.env.EMAIL_SERVICE,
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  smsService: {
    apiKey: process.env.SMS_API_KEY,
    apiSecret: process.env.SMS_API_SECRET,
  },
};
