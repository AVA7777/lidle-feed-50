import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const lots = JSON.parse(fs.readFileSync(path.join(root, 'source/lots.json'), 'utf8'));
const projects = JSON.parse(fs.readFileSync(path.join(root, 'source/projects.json'), 'utf8'));
const xml = fs.readFileSync(path.join(root, 'lidle_feed_50.xml'), 'utf8');
const errors = [];

const count = (text, re) => (text.match(re) || []).length;
const offerCount = count(xml, /<offer internal-id=/g);
if (offerCount !== 50) errors.push(`Expected 50 offers, got ${offerCount}`);
if (lots.length !== 50) errors.push(`Expected 50 source lots, got ${lots.length}`);
if (projects.length !== 10) errors.push(`Expected 10 projects, got ${projects.length}`);

for (const p of projects) {
  const projectLots = lots.filter(l => l.project === p.id);
  if (projectLots.length !== 5) errors.push(`${p.id}: expected 5 lots, got ${projectLots.length}`);
  const roles = new Set(projectLots.map(l => l.role));
  for (const role of ['entry','optimal','value','family','premium']) if (!roles.has(role)) errors.push(`${p.id}: missing role ${role}`);
}

const ids = [...xml.matchAll(/<offer internal-id="([^"]+)"/g)].map(m => m[1]);
if (new Set(ids).size !== ids.length) errors.push('Duplicate internal-id values');
for (const tag of ['type','property-type','category','location','price','rooms','new-flat','floor','apartment','building-name','image','description','area']) {
  const n = count(xml, new RegExp(`<${tag}(?:>| )`, 'g'));
  if (n < 50) errors.push(`Required tag ${tag}: only ${n}`);
}
if (/по данным\s+(?:trendagent|тренд\s*агент)/iu.test(xml)) errors.push('Forbidden source attribution appears in description');
if (count(xml, /<image>/g) < 250) errors.push('Expected at least 5 images per offer');
if (count(xml, /<phone>\+79256765197<\/phone>/g) !== 50) errors.push('Every offer must contain the only approved phone number');
if (/<phone>(?!\+79256765197<\/phone>)/g.test(xml)) errors.push('Feed contains an unapproved phone number');
if (!xml.endsWith('</realty-feed>\n')) errors.push('Feed closing tag/newline invalid');

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`OK: ${offerCount} offers, 10 projects, 5 roles per project, unique IDs, required fields present.`);
