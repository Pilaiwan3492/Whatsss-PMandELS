export interface TestDbOptions {
  isGitHubActions?: boolean;
  isCI?: boolean;
  allowLiveDb?: boolean;
  nodeEnv?: string;
  expectedDbName?: string;
}

export interface TestDbValidationResult {
  isValid: boolean;
  reason?: string;
}

export const DESIGNATED_TEST_DB = 'whatsss_test';

/**
 * Validates whether a given database URL targets an authorized, dedicated test database.
 *
 * Security and Integrity Invariants:
 * 1. DATABASE_URL must be a non-empty, valid URL with postgresql: or postgres: protocol.
 * 2. NODE_ENV must not be 'production'.
 * 3. Host must be strictly restricted to local/container loopback or service instances (localhost, 127.0.0.1, ::1, postgres, db).
 * 4. Production and development database names/keywords ('prod', 'production', 'live', 'staging', 'dev', 'development') are strictly rejected.
 * 5. Database name must match the designated test database ('whatsss_test') using exact matching.
 *    Generic names containing 'test' (e.g. 'production_test', 'whatsss_db_test') or the development database 'whatsss_db' are rejected.
 * 6. Environment variables (such as GITHUB_ACTIONS or CI) cannot bypass database validation or authorize unapproved databases.
 * 7. In local developer environments (isCI = false), allowLiveDb must be explicitly true.
 * 8. Fails closed: any unparseable, ambiguous, or invalid database configuration is rejected immediately.
 */
export function validateTestDatabaseUrl(
  databaseUrl: string,
  options: TestDbOptions = {}
): TestDbValidationResult {
  if (!databaseUrl || typeof databaseUrl !== 'string' || databaseUrl.trim().length === 0) {
    return { isValid: false, reason: 'DATABASE_URL is empty or undefined.' };
  }

  const effectiveNodeEnv = options.nodeEnv || process.env.NODE_ENV;
  if (effectiveNodeEnv === 'production') {
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

  const forbiddenKeywords = ['prod', 'production', 'live', 'staging', 'dev', 'development'];
  for (const keyword of forbiddenKeywords) {
    if (dbName.includes(keyword)) {
      return {
        isValid: false,
        reason: `Database name "${dbName}" contains forbidden production/development keyword "${keyword}".`
      };
    }
  }

  if (dbName === 'whatsss_db') {
    return {
      isValid: false,
      reason:
        'Database name "whatsss_db" is the development database, not an isolated test database. ' +
        'Tests must run against the dedicated test database ("whatsss_test").'
    };
  }

  const designatedDb = (options.expectedDbName || process.env.TEST_DATABASE_NAME || DESIGNATED_TEST_DB).toLowerCase();
  if (dbName !== designatedDb) {
    return {
      isValid: false,
      reason:
        `Database name "${dbName}" is not the authorized test database. Expected exact match: "${designatedDb}". ` +
        `Generic database names or non-test databases are strictly prohibited.`
    };
  }

  const isCI = options.isCI === true;
  if (!isCI && !options.allowLiveDb) {
    return {
      isValid: false,
      reason:
        'Live database tests are not enabled in local developer environment. ' +
        `Set ALLOW_LIVE_DB_TESTS="true" with dedicated test database "${designatedDb}" to run live tests.`
    };
  }

  return { isValid: true };
}

/**
 * Asserts that the database URL points to a verified test database.
 * Throws immediately with a fatal error if verification fails.
 */
export function assertTestDatabase(databaseUrl: string, options: TestDbOptions = {}): void {
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
 * Safely executes all registered cleanup tasks in reverse registration order (LIFO)
 * using bounded-retry snapshot restoration with failure reporting.
 *
 * Operational Policy:
 * 1. Bounded Retry: Each cleanup task is attempted up to maxAttempts (default 2) before marking failed.
 * 2. Failure Isolation: Every registered cleanup task in the queue is attempted; an error in an earlier
 *    task does not abort attempting subsequent tasks.
 * 3. Pop on Completion: Cleanups are removed from the queue only after completion or attempt exhaustion,
 *    preventing infinite loops while ensuring all tasks are processed.
 * 4. Transparent Failure Reporting: Cleanup failures are never silently ignored; all failed task records
 *    are collected and rethrown as an aggregate fatal error to fail the test suite, alerting
 *    engineers that the test database may remain in a partially restored state requiring manual investigation.
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
      .map((r, idx) => `[Task ${idx + 1}: ${r.name} (${r.attempts} attempts failed)] ${r.error?.message}`)
      .join('; ');
    const aggregateErr = new Error(
      `FATAL: Bounded-retry cleanup failed for ${summary.failed} task(s). Database may remain partially restored: ${combinedMessage}`
    );
    (aggregateErr as any).summary = summary;
    throw aggregateErr;
  }

  return summary;
}
