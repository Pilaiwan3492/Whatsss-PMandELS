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
 * 3. In local environments (!isCI), allowLiveDb must be explicitly true.
 * 4. Host must be restricted to local or container loopback/service instances (localhost, 127.0.0.1, ::1, postgres, db).
 * 5. Database name must not contain production-associated keywords ('prod', 'production', 'live', 'staging').
 * 6. In CI (isCI = true), the database name must specifically match the provisioned CI service container
 *    ('whatsss_db' or containing 'test').
 * 7. In local developer environments (isCI = false, allowLiveDb = true), the database name must explicitly
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

  // Meaningful validation of allowLiveDb in local environments
  if (!options.isCI && !options.allowLiveDb) {
    return {
      isValid: false,
      reason:
        'Live database tests are not enabled in local developer environment. ' +
        'Set ALLOW_LIVE_DB_TESTS="true" with a dedicated test database to run live tests.'
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
    // In CI pipeline, verify database matches the dedicated CI service container ('whatsss_db' or contains 'test')
    const isCiServiceDb = dbName === 'whatsss_db' || dbName.includes('test');
    if (!isCiServiceDb) {
      return {
        isValid: false,
        reason:
          `In CI environment, database name "${dbName}" does not match the provisioned CI service container ` +
          `("whatsss_db" or containing "test"). Refusing execution against unverified database.`
      };
    }
    return { isValid: true };
  }

  // In local development environments (with allowLiveDb = true), require explicit 'test' indicator in database name
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

/**
 * Safely executes all registered cleanup tasks in reverse registration order (LIFO).
 * Invariant: Every registered cleanup task is attempted even if earlier cleanups throw errors.
 * Any errors encountered are collected and rethrown as an aggregate error after all cleanups finish.
 */
export async function executeCleanupsSafely(cleanups: Array<() => Promise<void>>): Promise<void> {
  const errors: Error[] = [];
  while (cleanups.length > 0) {
    const cleanup = cleanups[cleanups.length - 1];
    try {
      await cleanup();
      cleanups.pop();
    } catch (err: any) {
      cleanups.pop();
      errors.push(err instanceof Error ? err : new Error(String(err)));
    }
  }

  if (errors.length > 0) {
    if (errors.length === 1) {
      throw errors[0];
    }
    const combined = errors.map((e, idx) => `[Error ${idx + 1}] ${e.message}`).join('; ');
    const aggregateErr = new Error(`FATAL: Cleanup failed with ${errors.length} error(s): ${combined}`);
    (aggregateErr as any).errors = errors;
    throw aggregateErr;
  }
}
