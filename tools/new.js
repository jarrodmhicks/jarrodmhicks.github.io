#!/usr/bin/env node
/* Make a new paper or presentation file with all the fields filled in.
   Usage:
     node tools/new.js paper "Short title" 2027
     node tools/new.js presentation "Talk title" 2027-03
   Then open the new file, fill it in, and run  node build.js  */
const fs = require('fs');
const path = require('path');

const [kind, title, when] = process.argv.slice(2);
if (!['paper', 'presentation'].includes(kind) || !title || !when) {
  console.error('Usage:\n  node tools/new.js paper "Short title" 2027\n  node tools/new.js presentation "Talk title" 2027-03');
  process.exit(1);
}
const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
const dir = path.join(__dirname, '..', 'data', kind === 'paper' ? 'papers' : 'presentations');
const file = path.join(dir, kind === 'paper' ? `hicks-${when}-${slug}.json` : `${when}-${slug}.json`);
if (fs.existsSync(file)) { console.error('That file already exists: ' + file); process.exit(1); }

const data = kind === 'paper'
  ? { title, authors: ['J. M. Hicks'], venue: '[Journal or conference]', year: parseInt(when, 10), topics: ['hearing'], details: {}, links: { doi: '', pdf: '', code: '', data: '' }, placeholder: true }
  : { title, type: 'talk', venue: '[Venue]', city: '[City]', date: when, conference: true, links: { slides: '', poster: '', video: '', code: '', data: '' }, placeholder: true };

fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
console.log('Created ' + path.relative(process.cwd(), file) + '\nFill it in, set "placeholder" to false, then run: node build.js');
