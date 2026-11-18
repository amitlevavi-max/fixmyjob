/**
 * Android 11+ hides other apps from ours unless we list them.
 * react-native-share needs to "see" these apps to share straight into them.
 * (This used to be a hand edit in android/app/src/main/AndroidManifest.xml;
 * it lives here now so the android folder can be regenerated at any time.)
 */
const { withAndroidManifest } = require('expo/config-plugins');

const SHARE_TARGETS = [
  'com.whatsapp',
  'com.whatsapp.w4b',
  'com.facebook.orca',      // Messenger
  'com.facebook.katana',    // Facebook
  'com.twitter.android',    // X
  'com.instagram.android',
];

module.exports = function withAndroidShareQueries(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    manifest.queries = manifest.queries || [{}];
    const q = manifest.queries[0];
    q.package = q.package || [];
    const have = new Set(q.package.map((p) => p.$['android:name']));
    for (const name of SHARE_TARGETS) {
      if (!have.has(name)) q.package.push({ $: { 'android:name': name } });
    }
    return cfg;
  });
};
