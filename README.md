# Fix My Job — website (landing, privacy, account deletion)

## What's here
```
website/                     static site — upload this folder to the host
  index.html                 landing page (QR code to the store listing)
  privacy.html               privacy policy (DRAFT — review before launch)
  delete-account.html        account deletion request form (Google Play "delete account" URL)
  assets/site.css            Workwear theme (same tokens as src/theme)
  assets/qr-app.svg          PLACEHOLDER QR — points to play.google.com/store/apps/details?id=com.fixmyjob.app
  assets/logo.png            official logo (copy of the app's assets/logo.png)
  assets/logo.svg            fallback logo
  assets/hero-workers.jpg    workers photo (copy of the app's assets/hero-workers.jpg — replace both when you have a real photo)
supabase/
  migrations/20261011000000_account_deletion_requests.sql
  functions/request-account-deletion/index.ts
```

## Where the files are
In the app repo: `website/` (incl. this README), `supabase/migrations/20261011000000_account_deletion_requests.sql`, `supabase/functions/request-account-deletion/`. `website/assets/logo.png` is a copy of the app's `assets/logo.png`.

## Backend setup (run in the shvoong folder)
1. `npx supabase db push`
2. `npx supabase functions deploy request-account-deletion --no-verify-jwt`
3. Secrets:
   - `npx supabase secrets set DELETION_NOTIFY_EMAIL=amitlevavi@gmail.com`
   - `npx supabase secrets set DELETION_IP_SALT=<any random text>`
   - Optional email: create a free https://resend.com account **with amitlevavi@gmail.com**, make an API key, then
     `npx supabase secrets set RESEND_API_KEY=re_...`
     (Until you verify your own domain in Resend, it can only send to the account owner's email — which is fine for these notifications. After verifying the domain, set `RESEND_FROM="Fix My Job <noreply@fixmyjob.ai>"`.)
   - Once the site is live: `npx supabase secrets set ALLOWED_ORIGINS=https://fixmyjob.ai,https://www.fixmyjob.ai`
4. Without `RESEND_API_KEY` requests are still recorded in the database; only the email is skipped.

## Reporting (Supabase SQL editor)
```sql
select * from account_deletion_requests order by created_at desc;      -- all requests
select * from account_deletion_requests_summary;                       -- per week
select * from account_deletion_requests where status = 'new';          -- to do

-- after deleting the user's data:
update account_deletion_requests set status = 'completed', completed_at = now(), handled_note = '...' where id = '...';
```
Deleting a user: Supabase → Authentication → Users → delete; plus their `user_profiles` row (and any other rows keyed by their id).

## Publishing the site
Cloudflare Pages / Netlify: drag the `website/` folder in, then add your custom domain. URLs to give the stores:
- Privacy policy: `https://fixmyjob.ai/privacy.html`
- Account deletion: `https://fixmyjob.ai/delete-account.html`

## Before going live
- Replace `assets/qr-app.svg` with the real store QR (or keep it — it already points at the future Play listing).
- Contact email is amitlevavi@gmail.com on all three pages — search-and-replace when you have a domain address.
- Privacy policy says database access is limited: re-enable RLS on `user_profiles` first (see decisions.md).
- The deletion page promises an email when the deletion is done — for now that's a manual email.

## Visitor analytics
Cloudflare Web Analytics is turned on for the Pages project (2026-11-06). Cloudflare adds its script automatically to each deployment, so there's no analytics code in these files; don't add the snippet by hand or visits get counted twice. It uses no cookies; the privacy policy ("When you visit our website" + Cloudflare row) describes it. The zone's own "Unique Visitors" chart counts every IP, bots included; use Web Analytics for real visitors.
