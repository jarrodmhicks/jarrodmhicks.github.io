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

### Add a presentation

```
node tools/new.js presentation "Talk title" 2027-03
```

Fields: `type` is `talk` or `poster`. `date` is `YYYY-MM` (or `YYYY-MM-DD`). `city` feeds the "cities" count (each city counted once). `conference` is `true` for a conference or meeting and `false` for something like a university seminar; it feeds the "conferences" count (every one counts, even at the same meeting twice). Links are optional and only show when filled in: `slides`, `poster`, `video`, `code`, `data`, `demo`.

The twelve presentations that came with this site are made-up placeholders (`"placeholder": true`, with `example.com` links). Replace them with real ones; every build lists the placeholders that are left. The Presentations page groups tickets by year and has a search box, a type filter and a year dropdown, like Papers.

### Other files in `data/`

| File | What it controls |
| --- | --- |
| `site.json` | Name, email, the tagline, intro line, About paragraphs, and the short line under each page title |
| `timeline.json` | The Path on the About page |
| `lately.json` | The Lately page. One entry per colored label (one word, 7 at most). `items` is a list of texts, **newest first**: the first one is shown, and the arrows page back through the rest. To add something new, put it at the top of that label's list. No dates anywhere. The footer shows "Last updated", set automatically from your newest commit that touched `data/` |
| `links.json` | The Contact page buttons. A link with an empty `url` is left off |
| `consulting.json` | The three Consulting cards (`art` is `check`, `demo` or `explain`) |
| `topics.json` | Paper topics and their colors |

**To do:** `links.json` needs your YouTube and Instagram URLs. They are blank on purpose, so they do not show yet. The three `[bracketed]` lines on the Lately page (listening to, reading, brewing) are placeholders too.

## What is where

```
dist/                              the built site (made by build.js, never committed)
.github/workflows/deploy.yml       the Action: builds and publishes on every push
assets/css/site.css                all styling
assets/fonts/                      Fraunces, Inter Tight, JetBrains Mono (self-hosted, SIL OFL)
assets/js/site.js                  menu on phones, copy email, papers search and filters, 404
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
