/**
 * Link included in every share.
 *
 * Our domain: fixmyjob.ai (registered on Cloudflare; site = website/ on Cloudflare Pages).
 * Everything that shares reads it from here.
 */
export const APP_LINK = 'https://fixmyjob.ai';

/** Link with the sharer's referral code, so sign-ups can be credited later. */
export function shareLink(refCode?: string | null) {
  return refCode ? `${APP_LINK}/?ref=${encodeURIComponent(refCode)}` : APP_LINK;
}

/**
 * Pages opened from the Fix My Job menu (top-left logo). They open in an
 * in-app browser tab, so the user never leaves the app.
 *
 * Pages live in website/ (privacy.html, delete-account.html); they work once
 * the site is published on fixmyjob.ai.
 */
export const PRIVACY_URL = `${APP_LINK}/privacy.html`;
export const DELETE_DATA_URL = `${APP_LINK}/delete-account.html`;

/**
 * The app's store listing, sent by the share button at the top of the screen
 * (next to the avatar). PLACEHOLDER — replace with the real store link(s)
 * before launch (Google Play: play.google.com/store/apps/details?id=com.fixmyjob.app;
 * App Store link once the iPhone app is published).
 */
export const STORE_LINK = 'https://fixmyjob.ai/app';
