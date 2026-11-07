export interface TestDbOptions {
  isCI: boolean;
  allowLiveDb: boolean;
  nodeEnv?: string;
}

export interface TestDbValidationResult {
  isValid: boolean;
  reason?: string;
}

/**
 * Validates whether a given database URL targets an isolated test database.
 *
 * Rules:
 * 1. DATABASE_URL must be a non-empty, valid URL with postgresql: or postgres: protocol.
 * 2. NODE_ENV must not be 'production'.
 * 3. Host must be restricted to local or container loopback/service instances (localhost, 127.0.0.1, ::1, postgres, db).
 * 4. Database name must not contain production-associated keywords ('prod', 'production', 'live', 'staging').
 * 5. In CI (isCI = true), the provisioned service container database is accepted.
 * 6. In local developer environments (isCI = false, allowLiveDb = true), the database name must explicitly
 *    contain 'test' (e.g. 'whatsss_test', 'whatsss_db_test') to prevent accidental mutation of the primary
 *    development database ('whatsss_db').
 */
export function validateTestDatabaseUrl(
  databaseUrl: string,
  options: TestDbOptions
): TestDbValidationResult {
  if (!databaseUrl || typeof databaseUrl !== 'string' || databaseUrl.trim().length === 0) {
    return { isValid: false, reason: 'DATABASE_URL is empty or undefined.' };
  }

  if (options.nodeEnv === 'production') {
    return {
      isValid: false,
      reason: 'NODE_ENV is set to "production". Live DB tests are strictly forbidden in production.'
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    return { isValid: false, reason: 'DATABASE_URL is not a valid URL.' };
  }

  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== 'postgres:' && protocol !== 'postgresql:') {
    return {
      isValid: false,
      reason: `Unsupported database protocol "${parsed.protocol}". Expected "postgresql:" or "postgres:".`
    };
  }

  const hostname = parsed.hostname.toLowerCase();
  const allowedHosts = ['localhost', '127.0.0.1', '::1', 'postgres', 'db'];
  if (!allowedHosts.includes(hostname)) {
    return {
      isValid: false,
      reason: `Live DB tests are restricted to local/container test instances. Host "${hostname}" is not permitted.`
    };
  }

  const dbName = parsed.pathname.replace(/^\//, '').toLowerCase();
  if (!dbName) {
    return { isValid: false, reason: 'DATABASE_URL does not specify a database name.' };
  }

  const forbiddenKeywords = ['prod', 'production', 'live', 'staging'];
  for (const keyword of forbiddenKeywords) {
    if (dbName.includes(keyword)) {
      return {
        isValid: false,
        reason: `Database name "${dbName}" contains forbidden production keyword "${keyword}".`
      };
    }
  }

  if (options.isCI) {
    // In CI pipeline, the dedicated PostgreSQL service container is isolated to the job runner
    return { isValid: true };
  }

  // In local development environments, require explicit 'test' indicator in database name
  if (!dbName.includes('test')) {
    return {
      isValid: false,
      reason:
        `Database name "${dbName}" is not verified as a test database. In local environments, ` +
        `the database name must explicitly contain "test" (e.g. "whatsss_test", "whatsss_db_test") ` +
        `to prevent accidental modification of local development data.`
    };
  }

  return { isValid: true };
}

/**
 * Asserts that the database URL points to a verified test database.
 * Throws immediately with a fatal error if verification fails.
 */
export function assertTestDatabase(databaseUrl: string, options: TestDbOptions): void {
  const result = validateTestDatabaseUrl(databaseUrl, options);
  if (!result.isValid) {
    throw new Error(`FATAL: Test database verification failed. ${result.reason}`);
  }
}
