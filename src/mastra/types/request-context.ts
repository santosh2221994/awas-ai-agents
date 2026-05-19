/**
 * types/request-context.ts
 *
 * Canonical type for the application's RequestContext.
 * Import this wherever you use `requestContext.get()` or `requestContextSchema`.
 *
 * Keys are kebab-case strings (Mastra convention).
 */

/** All context keys the app can carry on a request. */
export type AppRequestContext = {
  /** Authenticated user identifier (set by auth middleware). */
  'user-id': string;

  /** User subscription tier — drives model routing and feature gates. */
  'user-tier': 'enterprise' | 'pro' | 'free';

  /**
   * BCP-47 locale tag, e.g. "en", "ja", "de", "fr".
   * Derived from Accept-Language header (first tag only).
   */
  locale: string;

  /**
   * Preferred temperature unit.
   * Derived from CF-IPCountry header: "US" → fahrenheit, all others → celsius.
   */
  'temperature-unit': 'celsius' | 'fahrenheit';

  /** Organisation / workspace identifier for multi-tenant isolation. */
  'tenant-id': string;

  /**
   * Explicit flag to allow sandbox command execution.
   * Must be "true" to unlock execute_command in power workspaces.
   * Defaults to "false" when not set.
   */
  'allow-commands': 'true' | 'false';
};

/** Keys that map to string values — used for runtime .get() typing helpers. */
export type AppContextKey = keyof AppRequestContext;
export type AppContextValue<K extends AppContextKey> = AppRequestContext[K];
