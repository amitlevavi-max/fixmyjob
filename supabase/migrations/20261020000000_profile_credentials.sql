-- The user's answers to "Do you have these?" (mandatory credentials of their job,
-- onboarding screen Credentials): { "<credential name>": true | false }.
-- true = has it, false = doesn't. Names match occupation_credentials.name, so an
-- answer also counts for other jobs that need the same credential.
alter table public.user_profiles add column if not exists credentials jsonb;
