import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const projects = JSON.parse(fs.readFileSync(path.join(root, 'source/projects.json'), 'utf8'));
const lots = JSON.parse(fs.readFileSync(path.join(root, 'source/lots.json'), 'utf8'));
const byProject = new Map(projects.map(p => [p.id, p]));

const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
const fmt = value => Number(value).toLocaleString('ru-RU', { maximumFractionDigits: 2 });
const isoMoscow = () => {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(now).replace(' ', 'T');
  return `${parts}+03:00`;
};

const roleLead = {
  entry: 'Входной билет в проект: один из самых доступных вариантов в текущей подборке.',
  optimal: 'Сбалансированный вариант по бюджету, площади и планировке.',
  value: 'Рациональный выбор: больше полезной площади относительно соседних по цене предложений.',
  family: 'Семейный формат с удобным зонированием и полноценной кухней или кухней-гостиной.',
  premium: 'Верхний ценовой сегмент проекта: просторный формат для покупателей с повышенными требованиями.'
};

function roomsFor(type) {
  if (/студ/i.test(type)) return { rooms: 1, studio: true };
  const n = Number((type.match(/\d+/) || ['1'])[0]);
  return { rooms: /Е/.test(type) ? Math.max(1, n - 1) : n, studio: false };
}

function internalId(lot) {
  return `${lot.project}-${String(lot.flat).replaceAll(/[^0-9A-Za-z-]/g, '-')}`.toLowerCase();
}

function description(lot, p) {
  const kitchen = lot.kitchen > 0 ? `Кухня${/Е/.test(lot.type) ? '-гостиная' : ''} — ${fmt(lot.kitchen)} кв. м. ` : '';
  const finish = lot.finish === 'Чистовая' ? 'Предусмотрена чистовая отделка.' : lot.finish === 'Без отделки' ? 'Квартира передаётся без отделки.' : 'Квартира передаётся без внутренних стен.';
  return `${roleLead[lot.role]} ${lot.type} № ${lot.flat}, ${fmt(lot.area)} кв. м, ${lot.floor} этаж, корпус ${lot.building}, секция ${lot.section}. ${kitchen}${finish} ${p.intro} До метро «${p.metro}» около ${p.walkMinutes} минут пешком. Цена указана для варианта со 100% оплатой и может измениться. Актуальные условия покупки и наличие уточняйте.`;
}

function imagesFor(lot, p, lotIndex) {
  const rotated = p.images.map((_, i) => p.images[(i + lotIndex) % p.images.length]);
  return lot.plan ? [lot.plan, ...rotated] : rotated;
}

const generatedAt = isoMoscow();
const projectCounters = new Map();
const offers = lots.map(lot => {
  const p = byProject.get(lot.project);
  if (!p) throw new Error(`Unknown project: ${lot.project}`);
  const idx = projectCounters.get(lot.project) || 0;
  projectCounters.set(lot.project, idx + 1);
  const images = imagesFor(lot, p, idx);
  const room = roomsFor(lot.type);
  return [
    `  <offer internal-id="${esc(internalId(lot))}">`,
    '    <type>продажа</type>',
    '    <property-type>жилая</property-type>',
    '    <category>квартира</category>',
    `    <creation-date>${generatedAt}</creation-date>`,
    '    <location>',
    `      <address>${esc(p.address)}</address>`,
    `      <latitude>${p.latitude}</latitude>`,
    `      <longitude>${p.longitude}</longitude>`,
    `      <metro><name>${esc(p.metro)}</name><time-on-foot>${p.walkMinutes}</time-on-foot></metro>`,
    '    </location>',
    '    <sales-agent><name>Посоветуй</name><category>agency</category><organization>Посоветуй</organization></sales-agent>',
    '    <deal-status>первичная продажа</deal-status>',
    `    <price><value>${lot.price}</value><currency>RUR</currency></price>`,
    `    <rooms>${room.rooms}</rooms>`,
    room.studio ? '    <studio>true</studio>' : '',
    '    <new-flat>true</new-flat>',
    `    <floor>${lot.floor}</floor>`,
    `    <apartment>${esc(lot.flat)}</apartment>`,
    `    <building-name>${esc(p.name)}</building-name>`,
    `    <building-section>корпус ${esc(lot.building)}, секция ${esc(lot.section)}</building-section>`,
    '    <building-state>unfinished</building-state>',
    p.readyQuarter ? `    <ready-quarter>${p.readyQuarter}</ready-quarter>` : '',
    p.builtYear ? `    <built-year>${p.builtYear}</built-year>` : '',
    p.keyHandoverDate ? `    <key-handover-date>${p.keyHandoverDate}</key-handover-date>` : '',
    ...images.map(image => `    <image>${esc(image)}</image>`),
    `    <description>${esc(description(lot, p))}</description>`,
    `    <area><value>${lot.area}</value><unit>кв. м</unit></area>`,
    lot.kitchen > 0 ? `    <kitchen-space><value>${lot.kitchen}</value><unit>кв. м</unit></kitchen-space>` : '',
    '  </offer>'
  ].filter(Boolean).join('\n');
});

const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<realty-feed xmlns="http://webmaster.yandex.ru/schemas/feed/realty/2010-06">\n  <generation-date>${generatedAt}</generation-date>\n${offers.join('\n\n')}\n</realty-feed>\n`;
fs.writeFileSync(path.join(root, 'lidle_feed_50.xml'), xml);

const csvCell = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
const headers = ['internal_id','project','role','type','building','section','floor','flat','area','kitchen','finish','price','price_per_m2','source_url'];
const rows = lots.map(l => [internalId(l), byProject.get(l.project).name, l.role, l.type, l.building, l.section, l.floor, l.flat, l.area, l.kitchen, l.finish, l.price, Math.round(l.price/l.area), `https://msk.trendagent.ru/object/${l.project === 'nizhegorodskaya' ? 'mypriority-nizhegorodskaya' : l.project === 'admiral' ? 'admiral-gals' : l.project}/#apartments`]);
fs.writeFileSync(path.join(root, 'lots.csv'), [headers, ...rows].map(r => r.map(csvCell).join(',')).join('\n') + '\n');

const manifestHeaders = ['internal_id','project','flat','cover_image','image_count','cover_is_plan'];
const manifestRows = lots.map((l, i) => {
  const p = byProject.get(l.project);
  const projectIndex = lots.slice(0, i).filter(x => x.project === l.project).length;
  const images = imagesFor(l, p, projectIndex);
  return [internalId(l), p.name, l.flat, images[0], images.length, Boolean(l.plan)];
});
fs.writeFileSync(path.join(root, 'image_manifest.csv'), [manifestHeaders, ...manifestRows].map(r => r.map(csvCell).join(',')).join('\n') + '\n');

console.log(`Generated ${offers.length} offers across ${projects.length} projects at ${generatedAt}`);
