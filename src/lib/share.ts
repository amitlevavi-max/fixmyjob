/**
 * Share a picture (captured from the screen) plus a message and link to a
 * specific app — WhatsApp, Messenger, X, Instagram — or the phone's own
 * share menu. If the chosen app isn't installed, falls back to the share menu.
 *
 * The native libraries (react-native-share, react-native-view-shot) are loaded
 * only when someone shares, so an app build without them still runs — sharing
 * then falls back to plain text via React Native's built-in Share.
 */
import { RefObject } from 'react';
import { Share as RNShare } from 'react-native';
import { supabase } from './supabase';

export type ShareChannel = 'whatsapp' | 'messenger' | 'x' | 'instagram' | 'other';

function loadNative() {
  try {
    /* eslint-disable @typescript-eslint/no-var-requires */
    const share = require('react-native-share');
    const shot = require('react-native-view-shot');
    return { Share: share.default, Social: share.Social, captureRef: shot.captureRef };
  } catch {
    return null;   // this app build doesn't include them yet (rebuild with `npx expo run:android`)
  }
}

/** PNG of a view as a data URI (react-native-share writes it to a temp file). */
export async function captureImage(ref: RefObject<any>): Promise<string | null> {
  const native = loadNative();
  if (!native) return null;
  const base64 = await native.captureRef(ref, { format: 'png', quality: 1, result: 'base64' });
  return `data:image/png;base64,${base64}`;
}

const dismissed = (e: any) => /did not share|cancel/i.test(String(e?.message ?? e));

export async function shareTo(channel: ShareChannel, opts: {
  image: string | null;       // data URI from captureImage, or null for text only
  message: string;            // includes the link
  screen: string;             // for share statistics, e.g. 'earnings_rank'
  refCode?: string | null;
}) {
  const { image, message } = opts;
  const native = loadNative();

  if (!native) {
    // Old build: text-only share through the phone's share menu
    await RNShare.share({ message }).catch(() => {});
  } else {
    const { Share, Social } = native;
    const social: Record<Exclude<ShareChannel, 'other'>, unknown> = {
      whatsapp: Social.Whatsapp,
      messenger: Social.Messenger,
      x: Social.Twitter,
      instagram: Social.Instagram,
    };
    // useInternalStorage: write the picture to the app's own cache folder. The
    // default (external cache) isn't covered by react-native-share's file
    // provider paths, so the chosen app got a link it couldn't open and the
    // share silently did nothing.
    const file = image ? { url: image, type: 'image/png', filename: `fix-my-job-${Date.now()}`, useInternalStorage: true } : {};
    try {
      if (channel === 'other') {
        await Share.open({ ...file, message, failOnCancel: false });
      } else {
        // Instagram ignores text; the picture carries the message there
        await Share.shareSingle({ social: social[channel], ...file, message, forceDialog: false });
      }
    } catch (e) {
      if (dismissed(e)) return;
      // App not installed (or it refused the content) → phone's share menu
      await Share.open({ ...file, message, failOnCancel: false }).catch(() => {});
    }
  }

  // Count shares to see what spreads (no content is stored)
  supabase.rpc('log_share', { p_screen: opts.screen, p_channel: channel, p_ref: opts.refCode ?? null })
    .then(() => {}, () => {});
}
