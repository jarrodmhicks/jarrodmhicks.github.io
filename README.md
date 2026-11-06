# jarrodmhicks.com

Plain HTML, CSS and a little JavaScript. No framework and no dependencies. The pages are built from small JSON files in `data/` by one script, `build.js`. **You only commit the source files. GitHub builds and publishes the site every time you push.**

## How it works

```
edit a JSON file  →  commit / push to GitHub  →  the Action runs build.js  →  site is live (about a minute)
```

`build.js` reads `data/*.json`, checks them, and writes the finished site into a `dist/` folder: every page, `sitemap.xml`, `robots.txt`, and a copy of `assets/` (CSS, JS, fonts, photo). `dist/` is not committed (it is in `.gitignore`); the Action builds it fresh each time and publishes it. If a JSON file has a mistake, the build fails with a plain message, the Action turns red, and the live site stays as it was.

You can edit without ever running anything: open a file in `data/` on github.com, click the pencil, change it, and commit. The Action does the rest. Watch it under the repo's **Actions** tab.

## One-time setup

1. In your `jarrodmhicks.github.io` repo, delete the old template's files, but keep `CNAME` and the `.git` folder. That means the old `index.html`, `css/`, `js/`, `images/`, `fonts/` and anything else from the FreeHTML5 template.
2. Copy everything from this folder into the repo. Make sure the hidden `.github/` folder comes along (it holds the Action).
3. On GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**. Your custom domain (jarrodmhicks.com) stays set on that same page.
4. Commit and push to `main` (or `master`; both work). The first run is under the **Actions** tab. When it is green, the site is live.

The old page showed a phone number and office address. They are gone from this version. Search the old repo history if you want to be sure they no longer appear anywhere public.

## Look at it on your computer (optional)

Double-click-friendly preview: `node build.js --local` (or `npm run preview`), then open `dist/index.html` in your browser. This build uses relative links so it works from a file. Do not push that version; the Action always makes the real one.

```
node build.js
python3 -m http.server 8000 --directory dist
```

Then go to http://localhost:8000. (`npm run serve` does both.) You need Node 16 or newer.

## Change something

Edit a file in `data/`, commit, push. That is all. Example of a build error: `data/papers/foo.json: missing or invalid "year"`.

### Links and bold in text

The intro, About paragraphs, Lately items, Consulting cards and page subtitles accept simple markup: `[link text](https://example.com)` for a link and `**bold**` for bold. Links to other sites open in a new tab. Links to your own pages work too: `[my papers](/papers/)`. Nothing else is interpreted.

### Add a paper

```
node tools/new.js paper "Short title" 2027
```

This creates `data/papers/hicks-2027-short-title.json`. Open it and fill it in:

```json
{
  "title": "Full paper title",
  "authors": ["J. M. Hicks", "J. H. McDermott"],
  "venue": "Journal or conference name",
  "year": 2027,
  "topics": ["hearing"],
  "details": { "volume": "12", "issue": "3", "pages": "100–110" },
  "links": { "doi": "10.xxxx/xxxxx", "pdf": "", "code": "", "data": "" },
  "citations": 12,
  "placeholder": false
}
```

- `authors`: your name must be written exactly as `J. M. Hicks` for it to show in bold.
- `topics` must come from `data/topics.json` (hearing, neural methods, stroke & rehab, aging & vision). To add a topic, add it there with a color.
- `doi` is just the DOI, without `https://doi.org/`.
- `citations` is optional. When it is a number, a "cited by" tag appears. Copy it from Google Scholar when you update, since Scholar has no public data feed.
- Empty links are left off the page.

**New sticker.** A paper with no citations yet gets a pink **new** sticker where the citation badge would go, if it is recent. Add the month so it is accurate: `month = {oct}` in the `.bib` entry (or `"month": 10` in a JSON file) means "new for about 7 months". With only a year, a paper counts as new for that calendar year. To force it either way, add `new = {true}` or `new = {false}` (JSON: `"new": true`). Once a paper has citations, the yellow citation badge replaces it.

**Motion.** Small animations are built in and switch off for visitors who set "reduce motion": the first time you open a page in a visit its tabs, title, stickers and cards animate in; sorting glides cards to their new places; filters fold non-matching cards away; the cite box eases open; paging through Lately shuffles cards out from behind the pile and back; the period on the home page cycles through the rainbow when clicked. Nothing needs configuring.

**Keyboard shortcuts.** `1`-`7` jump to the pages, `/` searches (from any page it opens Papers with the search box focused), `?` shows the full list, `Esc` clears the search. In the search box, `Enter` selects the top result. On Papers and Presentations, `n` or `↓` selects the next card, `b` or `↑` the previous one, `←` and `→` move along the selected card's links (DOI, PDF, code, data, slides, video) and `Enter` opens the highlighted one, `c` opens the BibTeX box, and `v` views the card (a paper's PDF, or its DOI if there is no PDF; a talk's slides, or its video). On Lately, `↑` and `↓` choose a row and `←` and `→` page it back and forward. The list is the "keyboard shortcuts" link in the footer (hidden on phones). Searching several words matches papers containing all of them. The links need no setup: the `←`/`→` highlight and `v` read the links already on each card.

Each paper gets a **cite** tag that opens its BibTeX with "copy BibTeX" and "copy citation" buttons. Both are built from the fields above. The type is guessed from the venue (a venue with "thesis" becomes a thesis, one with "conference" or "CCN" a conference paper, everything else a journal article). To force one, add `"bibtype": "article"`, `"inproceedings"` or `"phdthesis"`.

### Add a presentation

```
node tools/new.js presentation "Talk title" 2027-03
```

Fields: `type` is `talk` or `poster`. `date` is `YYYY-MM` (or `YYYY-MM-DD`). `city` feeds the "cities" count (each city counted once). `conference` is `true` for a conference or meeting and `false` for something like a university seminar; it feeds the "conferences" count (every one counts, even at the same meeting twice). Links are optional and only show when filled in: `slides`, `poster`, `video`, `code`, `data`, `demo`.

The twelve presentations that came with this site are made-up placeholders (`"placeholder": true`, with `example.com` links). Replace them with real ones; every build lists the placeholders that are left. The Presentations page groups tickets by year and has a search box, a type filter and a year dropdown, like Papers.

### Email and analytics

- **Email:** The Email sticker on the Contact page copies your address and shows a small toast with an "open mail app" button (on phones it opens the mail app directly). The address in `site.json` is stored encoded in the page and decoded by a script when clicked, so simple scrapers do not find it. Without JavaScript the sticker does nothing.
- **Analytics (optional):** In `data/site.json`, put your GoatCounter code in `analytics.goatcounter` (for example `"jarrodhicks"` for jarrodhicks.goatcounter.com), or a Cloudflare Web Analytics token in `analytics.cloudflare`. Empty means no tracking script is added at all. Preview builds (`--local`) never include it.

### Other files in `data/`

| File | What it controls |
| --- | --- |
| `site.json` | Name, email, the tagline, intro line, About paragraphs, and the short line under each page title (`ledes`; leave one empty, like About, Papers and Presentations, and no line or gap appears) |
| `timeline.json` | The Path on the About page. Each step's sticker shows its end year (or `now` when the `when` text ends in anything but a year), with the full `when` text under it |
| `lately.json` | The Lately page. One entry per colored label (one word, 7 at most). `items` is a list of texts, **newest first**: the first one is shown, and the arrows page back through the rest. To add something new, put it at the top of that label's list. No dates anywhere. The footer shows "Last updated", set automatically from your newest commit that touched `data/` |
| `links.json` | The Contact stickers after Email, in rainbow order. `icon` is `youtube`, `instagram`, `tiktok`, `bluesky`, `threads`, `x`, `github` or `scholar`. A sticker with an empty `url` is left off, unless it has `"soon": true`, which shows it tinted, dashed and badged "soon". When a profile is ready, fill in its `url` and delete `"soon": true` |
| `consulting.json` | The Consulting cards, in order (sticker colors follow the rainbow by position). `label` is the word on the sticker, `icon` is `check`, `explain`, `teach`, `demo`, `test`, `guest` or `sources`, `title` is the question, `text` the answer, and `example` the small line underneath (optional) |
| `topics.json` | Paper topics and their colors |

**To do:** `links.json` needs your YouTube and Instagram URLs. They are blank on purpose, so they do not show yet; TikTok, Bluesky, Threads and X are marked `"soon"`. The three `[bracketed]` lines on the Lately page (listening to, reading, brewing) are placeholders too.

## What is where

```
dist/                              the built site (made by build.js, never committed)
.github/workflows/deploy.yml       the Action: builds and publishes on every push
assets/css/site.css                all styling
assets/fonts/                      Fraunces, Inter Tight, JetBrains Mono (self-hosted, SIL OFL)
assets/js/site.js                  menu on phones, email sticker, papers search and filters, keyboard shortcuts, Lately, the Konami rain, 404
assets/img/jarrod.jpg              the portrait on the home page
assets/favicon.svg                 browser tab icon
data/                              everything you edit
build.js                           the build script
tools/new.js                       makes a blank paper or presentation file
```

To change the layout of a page, edit the matching section of `build.js` and `assets/css/site.css`, then push.

## Notes

- The home page photo is `assets/img/jarrod.jpg` (square, 800 × 800). Replace the file to change it.
- Fonts (Fraunces, Inter Tight, JetBrains Mono) are variable woff2 files in `assets/fonts/`, so nothing loads from Google. All three are free under the SIL Open Font License.
- The site is light only, by design.
