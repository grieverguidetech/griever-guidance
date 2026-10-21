# Spike: connect "Has the obituary been published?" to obituary websites

Issue: #196 (Linear GRI-17). Research only. No code. Researched on 2026-10-20.

## Question

The screen "Has the obituary been published?" (`apps/web/src/screens/ShareObituary.tsx`) asks the
user to paste a link. Can the app find or link the obituary for the user, so the user does not
type it again?

To answer, this doc checks each main obituary site for four things:

1. A public API.
2. A partner or affiliate program.
3. Search by name and place.
4. Link only.

It also quotes each site's rule on automated access. No plan in this doc relies on scraping where
the terms forbid it.

## How the app works today

- `ShareObituary.tsx` has one text field for the link and one optional field for the publisher.
  The app does not fetch the link. It only normalizes it (`normalizeUrl`) and shows it in the
  message preview ("We'll send ... You can read it here: <link>").
- "Help me write it" opens `ObituaryScreen.tsx`. That screen calls `POST /obituary` to draft an
  obituary with AI (SF-6). It is flagged off (`OBITUARY_DRAFTING_ENABLED`).
- The app asks for the link only on this step, after the service. It never asks during setup
  (C10).

## Options table

"Search" means a person can search the site by name and place in a browser. It does not mean a
machine can search it.

| Site | API | Partner program | Search | Terms on automated access (quote + URL) | Fit |
|---|---|---|---|---|---|
| **Legacy.com** (also hosts the obituary pages of about 1,500 US newspapers, its "Affiliate Newspapers") | None public. Not found in terms or search. | Yes, for businesses only: newspaper hosting and "Legacy Pro" for funeral homes. No program for apps found. | Yes (name, place, funeral home, newspaper) in the browser. | "Except as specifically authorized by Legacy.com, you may not deep-link to the Services for any purpose or access the Services with any robot, spider, web crawler, extraction software, or any other automated process or device to scrape, copy, or monitor any portion of the Services or any information, content, or material from the Services." Also: "You may not link or frame to any pages of the Services or any content contained therein, whether in whole or in part, except as provided herein." <https://www.legacy.com/about/terms-of-use> | **Link only, user-pasted.** No fetch, no preview, no app-made deep link without written permission. |
| **Newspapers** (local papers) | No common API. Most papers host obituaries on Legacy.com. | Through Legacy (see above). | Yes, through Legacy or the paper's own site. | For papers hosted by Legacy, Legacy's terms apply (same URL as above). Other papers: not verified. | **Link only.** Same rules as Legacy. |
| **Tribute Technology** funeral-home websites (includes FrontRunner; `frontrunnerpro.com/terms-of-use` redirects here) | None public. Partner integrations exist (Passare, SRS, Chptr, ObituaryShare). No developer API found. | Yes, for funeral-industry vendors. No program for consumer apps found. | Per funeral home site only. | "Deep-link to any feature or content on the Services, or access, monitor or copy any content or information of the Services using any robot, spider, scraper, crawler or other automated means or any manual process for any purpose without our express written permission". The terms cover "the websites of our client funeral homes". Last updated June 4, 2025. <https://www.tributetech.com/terms-of-use> | **Link only, user-pasted.** |
| **Tribute Archive** (Tribute Technology aggregator) | None found. | None found for apps. | Yes, in the browser (not verified: site blocked our requests with HTTP 403). | Not verified. The page <https://www.tributearchive.com/terms-policy> returned HTTP 403. Tribute Technology's terms say content "will be shared with and stored by us and our affiliates and partners, including but not limited to Tribute Archive" (<https://www.tributetech.com/terms-of-use>), so the Tribute terms above very likely apply. | **Link only.** |
| **Dignity Memorial** (SCI funeral homes) | None found. | None found. | Yes: name, state, and date range in the browser. | "use any robot, spider, scraper, data mining tools, data gathering and extraction tools, or other automatic device or manual process to access, copy, or scrape the Services for any purpose" (Section 5). Last updated October 18, 2023. <https://www.dignitymemorial.com/terms-of-service> (quote taken through a fetch tool; the raw page returned HTTP 403 to curl) | **Link only.** |
| **Echovita** | None found. | None found. Site carries retail affiliate links (flowers, DNA tests). | Yes, in the browser. | No clause on robots, scraping, or automated access. Closest rule: "you are expressly prohibited from modifying, adjusting, copying, distributing, reproducing, partially or entirely, or use the Intellectual Property of Echovita in any other way." <https://www.echovita.com/us/terms-of-service> | **Do not integrate.** SCI sued Echovita in 2021 for copying obituaries from funeral home sites. Families call these copies "unauthorized". A grieving user should not get a link to a copied page from us. A link the user pastes is still fine. |
| **Ever Loved** | None found. | None found for apps. | Yes, in the browser. | "Attempt to access or search the Services or download Content from the Services through the use of any engine, software, tool, agent, device or mechanism (including spiders, robots, crawlers, data mining tools or the like) other than the software and/or search agents provided by Ever Loved or other generally available third-party web browsers". <https://everloved.com/terms-of-service/> Not verified directly: the page returned HTTP 403; the quote comes from a search-engine excerpt (page dated February 9, 2023). | **Link only.** |
| **ObituaryMonitor** (paid aggregator API) | Yes. County feed (`GET /api/v1/county-feed/notices`) and name-and-place match (`POST /api/v1/verify`). Fields include obituary URL and funeral home. | Paid plan: "$249 / month per state". Nationwide: contact sales. | Yes, by API (name, county, state, date of death). | Terms not read. The page does not say how the data is collected. Its sample shows `"survivors_source": "scraped"`. <https://obituarymonitor.com/death-by-county-feed-api> | **Poor fit.** About $12,450 a month for 50 states. Built for death verification in finance and property. Sending the person's name to a data broker conflicts with the user-first rule. Source data may be scraped against the terms above. |
| **Pulse419** (licensed death-notice data) | API for full notice text (sales contact). | Paid, price not public. | Not verified. | Not verified. <https://pulse419.com/public-death-data/> | **Poor fit.** Same reasons as ObituaryMonitor. |
| **Scraper tools** (for example an Apify Legacy.com scraper) | Third-party scraper, "$2.40 / 1,000" records. | n/a | n/a | It breaks the Legacy rule quoted above. <https://apify.com/jungle_synthesizer/legacy-com-obituary-death-notice-scraper/api/openapi> | **Rejected.** Breaks Legacy's terms. |

### What the table says

1. No obituary site offers a public API to consumer apps.
2. The partner programs that exist sell to newspapers and funeral homes, not to apps.
3. Legacy, Tribute Technology (the funeral-home platform behind many local sites), Dignity Memorial,
   and Ever Loved forbid automated access. Legacy and Tribute also forbid deep links without
   written permission.
4. The one paid aggregator API costs $249 a month per state and has unclear sources.

## What the app could do

| # | Option | What the user sees | Cost | Risk | Terms |
|---|---|---|---|---|---|
| A | **Keep paste-a-link, make it smarter, with no network call.** Read the hostname of the pasted link on the device. Prefill "Where it was published" (for example `legacy.com` gives "Legacy.com", `dignitymemorial.com` gives "Dignity Memorial"). Show a calm hint if the text is not a web link. | Fewer fields to type. Same screen. | One small ticket (about 100 lines plus tests). $0 a month. | Low. No new route, no new data leaves the phone. | OK. The user pastes the link. The app does not access the site. |
| B | **Paste-a-link with a preview** (title and photo of the obituary). The gateway or the browser fetches the page. | A card with the name and photo. | One or two tickets, a new gateway route, about $0 to $5 a month. | High. A new public route that fetches any URL (server-side request forgery risk). Breaks Legacy, Tribute, Dignity, and Ever Loved terms (automated access). | **Not OK** for most sites. |
| C | **"Search on Legacy.com" link** that opens a search for the person's name and place. | A button that opens the browser. | Small ticket. $0. | Medium. Legacy forbids deep links "except as specifically authorized". Also blocked by HTTP 403 for our test request, so the search URL format is not verified. | Needs written permission from Legacy first. |
| D | **Partnership** with Legacy.com or Tribute Technology for search access. | Search inside the app. | Unknown price. Weeks to months of sales talks. Legal review. | Medium to high. Depends on a vendor. Sends the person's name to a third party. | OK only with a signed agreement. |
| E | **Paid aggregator API** (ObituaryMonitor, Pulse419). | Search inside the app. | $249 a month per state, or more. | High. Data-broker sourcing, privacy, and cost. | Unclear. Data may be scraped. |

## Security note on `/obituary`

Today the gateway has one obituary route: `POST /obituary` in
`libs/gateway-messages/src/obituaryRoute.ts`, mounted in `apps/gateway/src/worker.ts`.

1. It takes the form fields, builds a prompt, and calls the Anthropic Messages API with the
   server's `ANTHROPIC_API_KEY`. It returns `{ draft }`. It does not store anything.
2. It has **no sign-in check and no rate limit**. This is open question 10 in
   `docs/aws-migration-plan.md`. The only guard is CORS, and CORS does not stop a script or `curl`.
   Anyone who finds the URL can spend the project's AI budget.
3. Validation (C8) is shallow. It checks only that `fullName`, `dateOfBirth`, and `dateOfPassing`
   are non-empty strings. It has no length limits on any field, so one request can carry a very
   large prompt.
4. Mismatch: the UI treats date of passing as optional ("Date of passing is optional" in
   `ObituaryScreen.tsx`), but the route rejects an empty `dateOfPassing` with HTTP 400. A user who
   leaves it blank gets "Something went wrong" (not run in this session; read from the code).

Items 2 to 4 must be fixed before `OBITUARY_DRAFTING_ENABLED` goes on. They belong in a separate
ticket, as question 10 says. None of the options in this spike need `/obituary`.

Any new route from this spike (only options B, D, or E would add one) must validate its body (C8),
require sign-in, and have a rate limit. Option B would also need an allow-list of hosts to block
server-side request forgery.

## Recommendation

**Do option A. Do not build B, C, D, or E now.**

- **What:** keep "Link to the obituary" as a paste field on the share step. Add on-device parsing
  of the pasted link: check it is an `http` or `https` link, and prefill "Where it was published"
  from a small table of known hosts (Legacy.com, Dignity Memorial, Tribute Archive, Ever Loved,
  and plain hostnames for funeral home sites). Do not fetch the page.
- **Cost:** one ticket, size S, about 100 lines with unit tests in `apps/web` (and possibly a helper
  in `libs/shared` next to `normalizeUrl`). $0 a month. No new gateway route.
- **Risk:** low. No network call, so no terms breach, no new attack surface, and no new data leaves
  the phone. The main risk is a wrong publisher name for an unknown host. Mitigation: the field
  stays editable and optional.
- **C10:** respected. The app still asks for the link only on "Has the obituary been
  published?", after the service. It never asks during setup. The field stays optional to
  continue past ("Not published yet? We'll wait").
- **C8:** respected. Option A adds no gateway route. The `/obituary` gaps above go in their own
  ticket.
- **Later, optional and free:** email Legacy.com partnerships to ask for written permission for a
  "Search on Legacy.com" link (option C). Build C only if they say yes in writing.

## Not verified

- Tribute Archive terms: the page returned HTTP 403. The doc assumes the Tribute Technology terms
  apply.
- Ever Loved terms: the quote comes from a search-engine excerpt, not the live page (HTTP 403).
- Dignity Memorial terms: the quote comes through a fetch tool summary. The raw page returned
  HTTP 403 to curl.
- Newspapers not hosted by Legacy: terms not checked.
- Batesville / CFS funeral-home websites: no terms page found (`batesville.com/terms-of-use/`
  returned 404). Their rules are not known.
- Legacy search URL format and any Legacy app partner program: not confirmed. The search URL
  returned HTTP 403.
- ObituaryMonitor and Pulse419 terms and data sources: not read.
- The `dateOfPassing` mismatch was read from the code, not run.

## Sources

- Legacy.com terms of use: <https://www.legacy.com/about/terms-of-use> (raw page downloaded and
  quoted)
- Legacy.com robots.txt: <https://www.legacy.com/robots.txt>
- Legacy Pro for funeral homes: <https://www.legacy.com/contact/en/articles/11101281-join-legacy-pro-business>
- Legacy newspaper hosting partnerships: <https://www.nna.org/legacycom-announces-38-new-obituary-hosting-partnerships>
- Tribute Technology terms of use (covers client funeral home sites): <https://www.tributetech.com/terms-of-use>
  (raw page downloaded and quoted)
- Tribute Technology integrations: <https://www.tributetech.com/website-integrations-the-flexibility-of-the-tribute-technology-platform>
- Tribute Technology and FrontRunner join: <https://www.tributetech.com/leading-funeral-website-providers-join-in-next-phase-of-tribute-technology>
- Tribute Archive terms: <https://www.tributearchive.com/terms-policy> (HTTP 403)
- Dignity Memorial terms of service: <https://www.dignitymemorial.com/terms-of-service>
- Echovita terms of service: <https://www.echovita.com/us/terms-of-service> (raw page downloaded
  and searched)
- Echovita and the SCI lawsuit: <https://en.wikipedia.org/wiki/Obituary_piracy>
- Families on unauthorized obituary copies: <https://www.ctvnews.ca/toronto/consumer-alert/article/offensive-more-ont-families-come-forward-regarding-website-scraping-obituaries-without-consent/>
- Ever Loved terms of service: <https://everloved.com/terms-of-service/> (HTTP 403; search excerpt)
- ObituaryMonitor API: <https://obituarymonitor.com/death-by-county-feed-api> and
  <https://obituarymonitor.com/docs/api/county-feed>
- Pulse419: <https://pulse419.com/public-death-data/>
- Apify Legacy.com scraper: <https://apify.com/jungle_synthesizer/legacy-com-obituary-death-notice-scraper/api/openapi>
- FrontRunner obituary links (CBC): <https://amp.cbc.ca/news/canada/toronto/obituary-memorial-trees-funeral-frontrunner-1.6119639>
- Project files: `apps/web/src/screens/ShareObituary.tsx`, `apps/web/src/screens/ObituaryScreen.tsx`,
  `libs/gateway-messages/src/obituaryRoute.ts`, `apps/gateway/src/worker.ts`,
  `docs/aws-migration-plan.md` (question 10), `REQUIREMENTS.md` (C8, C10, SF-6)
