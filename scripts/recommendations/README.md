# Recommendations test tool

Check what the app would recommend to a user **without the UI or the emulator**.

You give it a profile (JSON, the same answers a user gives the app). It runs the
app's own recommendation code (`src/lib/planView.ts`, `src/lib/useOpportunities.ts`
and everything they use) against the live Supabase data, and returns the same
list My plan shows, grouped into **Quick wins / Worth the effort / Big moves**.

Nothing is re-implemented, so the results always match the app, including after
you change the app code (each run bundles the current `src/`). Nothing is saved:
the tool never signs in.

## One-time setup (PowerShell, in the app folder)

```powershell
npm install
```

(Adds three dev-only packages: `esbuild`, `react-test-renderer`, `@types/react-test-renderer`. They are not part of the app build.)

## Run it

```powershell
# One profile, easy to read
npm run recs -- scripts/recommendations/examples/forklift-la.json

# Several profiles at once
npm run recs -- scripts/recommendations/examples/cna-houston-rise.json scripts/recommendations/examples/delivery-nyc-rights.json

# A whole folder → a CSV for Excel (plus the full results as .json next to it)
npm run recs -- scripts/recommendations/personas --csv scripts/recommendations/personas-results.csv

# Full JSON (for saving or comparing)
npm run recs -- scripts/recommendations/examples/forklift-la.json --json > result.json

# As a web endpoint (Postman etc.): POST a profile to http://localhost:8787/recommendations
npm run recs -- --serve
```

## Compare with ChatGPT, Claude and Gemini (`--llms`)

Add `--llms` to any command to also see what a worker would get by asking the LLM apps directly.
For each profile the tool writes the question a regular user would type, for example:

> I am a nursing assistant with 1 and a half years of experience. I live in Memphis, Tennessee. I earn $35,600 a year. What would you advise me to do to earn more?

and sends it to Claude, ChatGPT and Gemini, with web search on (as the apps do) and the user's city as their location.
The last sentence follows the goal (earn more, move up, change careers, claim my rights…); employer and hourly pay are
included when the profile has them.

```powershell
# One profile: the app's list, then each LLM's answer and sources
npm run recs -- scripts/recommendations/personas/07-luis.json --llms

# Only some of them
npm run recs -- scripts/recommendations/personas/07-luis.json --llms claude,gemini

# All test users → personas-results.csv as before, plus personas-results-llms.csv
# (one row per person × LLM: question, the app's list, the LLM's answer, its sources)
npm run recs -- scripts/recommendations/personas --csv scripts/recommendations/personas-results.csv --llms

# Save what's printed to a file (UTF-8). Use this instead of "> file.txt": PowerShell's > garbles the symbols
npm run recs -- scripts/recommendations/personas/07-luis.json --llms --out scripts/recommendations/luis-vs-llms.txt

# Without web search (cheaper, but less like the real apps)
npm run recs -- scripts/recommendations/personas/07-luis.json --llms --no-web

# Server: POST /recommendations?llms  or  ?llms=chatgpt  (add &web=0 for no web search)
```

**API keys** — put them in `scripts/recommendations/.env.llm` (not in Git), one per line:

```
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=...
```

(or set them in PowerShell: `$env:OPENAI_API_KEY="sk-..."`). An LLM without a key is skipped with a note.

**Models** — defaults are close to what each app gives a regular user: `claude-sonnet-5-5`, `gpt-5.4`,
`gemini-3-flash-preview`. Change them in the same file with `CLAUDE_MODEL=`, `OPENAI_MODEL=`, `GEMINI_MODEL=`.

**Profile fields for this** (optional): `llmJob` — how the person would name their job (`"delivery driver"`; otherwise
`job`, otherwise the BLS title made plainer); `llmPrompt` — the whole question, word for word.

Notes: every call is billed to your API accounts (with web search, roughly a few cents per answer; all 10 test users ×
3 LLMs is 30 calls). The APIs don't have the apps' own instructions or the user's chat history, so answers are close
to — not identical with — what the apps show. The answers change from run to run.

Example files can also be given by name only: `npm run recs -- examples/forklift-la.json`.

## The profile

**Mandatory** (onboarding asks these):

| Field | Example | Notes |
|---|---|---|
| `goal` | `"earn_more"` | `earn_more`, `rise_up`, `work_life_balance`, `change_careers`, `claim_rights`, `less_physical` |
| `job` | `"forklift operator"` | As the user would type it. Not needed if you give `soc`. |
| `monthsInJob` or `yearsInJob` | `18` / `1.5` | Time in this job |
| `annualPay` | `36000` | Yearly pay, $ |

**Optional** (asked later in the app, or not at all):

| Field | Example | Notes |
|---|---|---|
| `soc` | `"53-7051"` | Exact occupation, as if picked from the list. `"none"` = "my job isn't listed" (then `job` is how they describe it). |
| `autoPickOccupation` | `true` | If `job` isn't a clear match, take the top candidate instead of stopping. |
| `otherGoals` | `["rise_up"]` | Profile → other goals |
| `location` | `{ "state": "CA", "metro": "Los Angeles" }` | Or `{ "state": "CA", "rural": true }`, or `{ "state": "CA" }` (city, no metro picked). State by code or name. Metro must be one of the app's metro areas (the error lists them). |
| `employer` | `"Amazon"` | |
| `hourlyRate` | `17.5` | Base hourly rate |
| `workSchedule` | `{ "hoursPerWeek": 48, "overtimeMultiplier": 1 }` | Missing fields = state defaults. Fields: `hoursPerWeek`, `daysPerWeek`, `weekendHoursPerWeek`, `overtimeMultiplier`, `weekendPremiumPct`. |
| `credentials` | `{ "<license name>": true }` | "Do you have this?" answers for mandatory licenses (names as the app shows them) |
| `rightsAnswers` | `{ "otPay": "same", "mealBreak": "never" }` | Claim my rights answers — fields in `src/lib/rightsFacts.ts` (`RightsFacts`) |
| `planDecisions` | `{ "get-certified": "in_plan" }` | Items already added (`in_plan`) or ruled out (`not_pursuing`) |
| `language` | `"es"` | Default `"en"` |
| `details` | `true` | Also return each item's explanation and steps |

### When the job isn't a clear match

The app asks the user to pick the closest job. The tool does the same: it stops
and lists the candidates (SOC + title). Add `"soc": "<one of them>"` to the
profile, or `"autoPickOccupation": true`.

## What comes back

- `profile` — what the app settled on: occupation (and how it was matched), goals, location label…
- `standing` — Where I stand → "Your earnings rank": `percentile` (earns more than N out of 100), `scenario`, `localPay` (p10/p25/median/p75/p90 for the job and place), `gapToMedian`, `source`. The CSV adds two columns for it.
- `buckets` — the task list in app order. Each item: `title` (as the app words it for the user's goals),
  `gainAmount` ($/year, 0 = no sourced figure), `gain` (the sentence the app shows), `source`,
  `kind` (`pay_fix`, `add_on`, `career_move`, `one_off`), `goals` it helps, `status` (`in_plan` / `to_review`), `id`.
- `potentialBoost` — the "potential yearly boost" and how it adds up (pay fixes and add-ons add up; only the best career move counts).
- With `--csv`: one row per recommendation (persona, goals, occupation, location, pay, bucket, rank, gain, the app's sentence, source, kind, status, id); failed profiles get one row with the error.
- `counts`, `minimumWageShortfall`, `meta.ms` (and `meta.warning` if some data was still loading after 45 s).

## Notes

- It needs internet access to Supabase, so run it on your PC (Claude's cloud workspace can't reach supabase.co).
- It uses the publishable key, like a signed-out app. If the parked lockdown of the reference data
  (`_backup/parked-lock-reference-data/`) is ever applied, the tool will need to sign in as a test user.
- The figures come from the same live data as the app, so they change when the data is refreshed.
- Files: `harness.tsx` (fills the app's store and runs the app's hooks), `run.mjs` (command line + server), `llms.mjs` (the `--llms` comparison),
  `shims/` (stand-ins for two phone-only modules), `examples/` (sample profiles), `personas/` (the 10 test users, as seeded by `scripts/seed-test-personas.mjs`), `browser-entry.ts` (browser build, not needed normally). `.build/` is generated.
