export interface TestDbOptions {
  isGitHubActions?: boolean;
  isCI?: boolean;
  allowLiveDb?: boolean;
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
 * 5. In GitHub Actions (isGitHubActions = true), the database name must specifically match the provisioned
 *    CI service container ('whatsss_db' or containing 'test').
 * 6. In generic CI (isCI = true but isGitHubActions != true), 'whatsss_db' is NOT allowed; the database
 *    must explicitly contain 'test' (e.g. 'whatsss_test') to prevent developers from bypassing local protection
 *    simply by setting CI=true.
 * 7. In local developer environments (isCI = false, isGitHubActions = false), allowLiveDb must be explicitly true,
 *    and the database name must explicitly contain 'test' (e.g. 'whatsss_test', 'whatsss_db_test').
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

  const isGitHubActions = options.isGitHubActions === true;
  const isGenericCI = !isGitHubActions && options.isCI === true;
  const isLocal = !isGitHubActions && !isGenericCI;

  // Local environments strictly require explicit opt-in flag
  if (isLocal && !options.allowLiveDb) {
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

  // 1. GitHub Actions trusted workflow environment
  if (isGitHubActions) {
    const isCiServiceDb = dbName === 'whatsss_db' || dbName.includes('test');
    if (!isCiServiceDb) {
      return {
        isValid: false,
        reason:
          `In GitHub Actions environment, database name "${dbName}" does not match the provisioned CI service container ` +
          `("whatsss_db" or containing "test"). Refusing execution against unverified database.`
      };
    }
    return { isValid: true };
  }

  // 2. Generic CI environment (e.g. developer setting CI=true locally without GitHub Actions)
  if (isGenericCI) {
    if (!dbName.includes('test')) {
      return {
        isValid: false,
        reason:
          `Database name "${dbName}" is not an isolated test database. Setting CI=true on a generic/local machine ` +
          `does not grant access to "whatsss_db". A dedicated test database whose name contains "test" ` +
          `(e.g. "whatsss_test") is required.`
      };
    }
    return { isValid: true };
  }

  // 3. Local developer environment (allowLiveDb = true)
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

export interface CleanupTask {
  name: string;
  run: () => Promise<void>;
}

export type CleanupItem = (() => Promise<void>) | CleanupTask;

export interface CleanupExecutionRecord {
  name: string;
  success: boolean;
  attempts: number;
  error?: Error;
}

export interface CleanupSummary {
  attempted: number;
  succeeded: number;
  failed: number;
  records: CleanupExecutionRecord[];
}

/**
 * Safely executes all registered cleanup tasks in reverse registration order (LIFO) with bounded retry.
 *
 * Invariants:
 * 1. Every registered cleanup task is attempted even if earlier cleanups fail.
 * 2. Successful cleanups are popped from the queue and NEVER re-executed.
 * 3. Failed cleanups are retried up to MAX_ATTEMPTS before being marked failed and popped,
 *    preventing infinite loops while guaranteeing remaining tasks in queue are executed.
 * 4. All failures are tracked in execution records and rethrown as an aggregate error at the end.
 * 5. Zero swallowed errors; full traceability.
 */
export async function executeCleanupsSafely(
  queue: CleanupItem[],
  maxAttempts: number = 2
): Promise<CleanupSummary> {
  const summary: CleanupSummary = {
    attempted: 0,
    succeeded: 0,
    failed: 0,
    records: []
  };

  while (queue.length > 0) {
    const item = queue[queue.length - 1];
    const taskName = typeof item === 'function' ? (item.name || 'anonymous_cleanup') : item.name;
    const taskFn = typeof item === 'function' ? item : item.run;

    summary.attempted++;
    let attempts = 0;
    let succeeded = false;
    let lastError: Error | undefined;

    while (attempts < maxAttempts && !succeeded) {
      attempts++;
      try {
        await taskFn();
        succeeded = true;
      } catch (err: any) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }

    // Always remove from queue once attempted up to bounded limit
    queue.pop();

    if (succeeded) {
      summary.succeeded++;
      summary.records.push({
        name: taskName,
        success: true,
        attempts
      });
    } else {
      summary.failed++;
      summary.records.push({
        name: taskName,
        success: false,
        attempts,
        error: lastError
      });
    }
  }

  if (summary.failed > 0) {
    const failedRecords = summary.records.filter((r) => !r.success);
    const combinedMessage = failedRecords
      .map((r, idx) => `[Task ${idx + 1}: ${r.name} (${r.attempts} attempts)] ${r.error?.message}`)
      .join('; ');
    const aggregateErr = new Error(`FATAL: Cleanup failed for ${summary.failed} task(s): ${combinedMessage}`);
    (aggregateErr as any).summary = summary;
    throw aggregateErr;
  }

  return summary;
}
