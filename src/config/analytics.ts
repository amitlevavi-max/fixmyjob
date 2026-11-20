/**
 * Product analytics (PostHog Cloud, free plan — 1M events a month).
 *
 * POSTHOG_KEY: the project API key from PostHog → Project settings → "Project API key"
 * (starts with phc_). It is a public key, safe to keep in the app.
 * Empty = analytics switched off (nothing is sent).
 *
 * POSTHOG_HOST: US cloud — our users are in the US. If the PostHog project is
 * created in the EU cloud instead, change it to https://eu.i.posthog.com.
 */
export const ANALYTICS = {
  POSTHOG_KEY: 'phc_CsP4fH4WnihXMwyTkJRREcyDoiYL96nojdajfSppMGT2',
  POSTHOG_HOST: 'https://us.i.posthog.com',
  /**
   * Key for hashing user ids before they reach PostHog (HMAC-SHA256, lib/analytics).
   * PostHog never sees a Supabase user id, so its data can't be joined to our
   * database on its own. Changing this value splits every user into a new person
   * in PostHog — don't change it once real users exist.
   */
  ID_HASH_KEY: 'c10c162cb5da2d9d5cc7bcc30d7c727e300a78da5b61d38c',
};
