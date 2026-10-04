// Builds the West Berkshire Voice website into the _site folder.
// Run with: node build.js   (no packages to install)
//
//   stories/*.json   one file per news story (edited through the CMS)
//   pages/*.html     the wording of the fixed pages
//   layout.html      the shared header, menu and footer
//   static/          stylesheet, icons and pictures, copied as they are
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const OUT = path.join(ROOT, '_site');
const HOME_STORIES = 5;
// Drafts are hidden on the live site but shown on preview copies.
const branch = process.env.CF_PAGES_BRANCH || '';
const SHOW_DRAFTS = branch !== '' && branch !== 'main';

const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const NAV = [['index.html', 'Home'], ['news.html', 'News'], ['about.html', 'About'], ['get-involved.html', 'Get Involved'], ['contact.html', 'Contact']];
const layout = read('layout.html');
const band = read('pages', '_band.html').trim();
const pageMeta = JSON.parse(read('pages', 'pages.json'));

function page({ title, description, nav, main, showBand = true, noindex = false }) {
  const links = NAV.map(([href, label]) => `<a href="${href}"${href === nav ? ' aria-current="page"' : ''}>${label}</a>`).join('');
  const meta = noindex ? '<meta name="robots" content="noindex">' : `<meta name="description" content="${esc(description)}">`;
  return layout
    .replace('{{title}}', () => esc(title))
    .replace('{{meta}}', () => meta)
    .replace('{{nav}}', () => links)
    .replace('{{main}}', () => main)
    .replace('{{band}}', () => (showBand ? band : ''));
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function longDate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
  if (!m) return '';
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

// The editor may save the story text as HTML or as Markdown. HTML is used as it is;
// Markdown gets a simple conversion (paragraphs, headings, lists, bold, italic, links, pictures).
function inline(text) {
  return esc(text)
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img src="$2" alt="$1">')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
}
function bodyHtml(body) {
  const text = String(body || '').trim();
  if (!text) return '';
  if (/<(p|h2|h3|ul|ol|figure|blockquote|div)[\s>]/i.test(text)) return text;
  return text.split(/\n\s*\n/).map((block) => {
    const b = block.trim();
    if (!b) return '';
    const h = /^(#{2,3})\s+(.*)$/.exec(b);
    if (h) return `<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`;
    const lines = b.split('\n');
    if (lines.every((l) => /^\s*[-*]\s+/.test(l))) return `<ul>${lines.map((l) => `<li>${inline(l.replace(/^\s*[-*]\s+/, ''))}</li>`).join('')}</ul>`;
    if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) return `<ol>${lines.map((l) => `<li>${inline(l.replace(/^\s*\d+[.)]\s+/, ''))}</li>`).join('')}</ol>`;
    return `<p>${inline(lines.join(' '))}</p>`;
  }).join('\n');
}

// ---- Load the stories, newest first
const storyDir = path.join(ROOT, 'stories');
const problems = [];
const stories = fs.readdirSync(storyDir).filter((f) => f.endsWith('.json')).map((file) => {
  let data;
  try { data = JSON.parse(fs.readFileSync(path.join(storyDir, file), 'utf8')); } catch (e) { problems.push(`${file}: not valid JSON (${e.message})`); return null; }
  const slug = file.replace(/\.json$/, '');
  if (!data.title) problems.push(`${file}: no headline`);
  if (!longDate(data.date)) problems.push(`${file}: no date`);
  return { ...data, slug, url: `${slug}.html` };
}).filter(Boolean)
  .filter((s) => s.title && longDate(s.date))
  .filter((s) => SHOW_DRAFTS || !s.draft)
  .sort((a, b) => String(b.date).localeCompare(String(a.date)) || a.title.localeCompare(b.title));

// ---- Safety check: every picture a story uses must exist in static/.
// On the live site a missing picture stops the build, so the last good version stays online.
// On preview and drafts copies the story is shown with a "Picture missing" box instead.
const IS_LIVE = branch === 'main';
const missing = [];
const localExists = (src) => !/^\/img\//.test(src) || fs.existsSync(path.join(ROOT, 'static', decodeURIComponent(src.split(/[?#]/)[0])));
// The caption goes under the picture; the credit sits over its bottom left corner.
const caption = (text) => (text ? `<figcaption>${esc(text)}</figcaption>` : '');
const pic = (img, credit) => `<span class="pic">${img}${credit ? `<span class="credit">Picture: ${esc(credit)}</span>` : ''}</span>`;
for (const s of stories) {
  // A story is a list of blocks: text and pictures. Older stories with a single "body" still work.
  s.parts = Array.isArray(s.content) && s.content.length ? s.content : [{ type: 'text', text: s.body || '' }];
  if (s.image && !localExists(s.image)) { missing.push(`${s.slug}: main picture ${s.image}`); s.imageMissing = true; }
  for (const part of s.parts) {
    if (part.type === 'picture' && part.image && !localExists(part.image)) { missing.push(`${s.slug}: picture in the story ${part.image}`); part.missing = true; }
    for (const m of String(part.text || '').matchAll(/<img[^>]+src="([^"]+)"/g)) {
      if (!localExists(m[1])) missing.push(`${s.slug}: picture in the story text ${m[1]}`);
    }
  }
}
if (missing.length) {
  console.log('Pictures missing from static/img:\n  ' + missing.join('\n  '));
  if (IS_LIVE) { console.error('Build stopped: restore the missing pictures or remove them from the stories.'); process.exit(1); }
}
const MISSING_BOX = '<span class="ph">Picture missing</span>';

function storyItem(s) {
  const thumb = s.image ? `<a class="thumb" href="${s.url}" tabindex="-1" aria-hidden="true">${s.imageMissing ? MISSING_BOX : `<img src="${esc(s.image)}" alt="" loading="lazy">`}</a>\n` : '';
  const where = [s.town, longDate(s.date)].filter(Boolean).map(esc).join(' · ');
  return `<article class="newsitem">\n${thumb}<div><p class="meta">${where}${s.draft ? ' · DRAFT' : ''}</p>\n<h2><a href="${s.url}">${esc(s.title)}</a></h2>\n<p>${esc(s.summary)}</p></div>\n</article>`;
}

function storyPage(s) {
  const figure = s.image ? `<figure>${pic(s.imageMissing ? MISSING_BOX : `<img src="${esc(s.image)}" alt="${esc(s.imageAlt)}">`, s.credit)}${caption(s.caption)}</figure>\n` : '';
  const parts = s.parts.map((part) => {
    if (part.type === 'picture') {
      if (!part.image) return '';
      return `<figure class="inline">${pic(part.missing ? MISSING_BOX : `<img src="${esc(part.image)}" alt="${esc(part.imageAlt || part.caption)}">`, part.credit)}${caption(part.caption)}</figure>`;
    }
    return bodyHtml(part.text);
  }).filter(Boolean).join('\n');
  const main = `<article class="story">${s.town ? `<p class="kicker">${esc(s.town)}</p>` : ''}
<h1>${esc(s.title)}</h1>
<p class="meta">Published ${longDate(s.date)}${s.draft ? ' · DRAFT, not shown on the live site' : ''}</p>
${String(s.byline || '').trim() ? `<p class="byline">By ${esc(String(s.byline).trim().replace(/^by\s+/i, ''))}</p>\n` : ''}${figure}${s.summary ? `<p class="intro">${esc(s.summary)}</p>\n` : ''}${parts}
<p><a href="news.html">More news</a></p>
</article>`;
  return page({ title: `${s.title} | West Berkshire Voice`, description: s.summary || s.title, nav: 'news.html', main });
}

// ---- Write the site
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.cpSync(path.join(ROOT, 'static'), OUT, { recursive: true, filter: (src) => path.basename(src) !== '.gitkeep' });
const write = (name, html) => fs.writeFileSync(path.join(OUT, name), html);

const latest = stories.slice(0, HOME_STORIES);
const latestBlock = latest.length ? `<section class="latest" aria-labelledby="latest-h">
<h2 id="latest-h">Latest news</h2>
<div class="newslist">
${latest.map(storyItem).join('\n')}
</div>
<p class="more"><a href="news.html">All news</a></p>
</section>\n` : '';
write('index.html', page({ ...pageMeta.index, showBand: pageMeta.index.band, main: `${read('pages', 'home-top.html').trim()}\n${latestBlock}${read('pages', 'home-bottom.html').trim()}` }));

write('news.html', page({
  title: 'News | West Berkshire Voice', description: 'News from West Berkshire Voice.', nav: 'news.html',
  main: `<div class="prose"><p class="kicker">News</p>\n<h1>News</h1></div>\n<div class="newslist">\n${stories.length ? stories.map(storyItem).join('\n') : '<p>No stories yet.</p>'}\n</div>`,
}));

for (const s of stories) write(s.url, storyPage(s));

// The crop tool for contributors: lists the pictures already uploaded so one can be re-cropped.
{
  const dir = path.join(ROOT, 'static', 'img', 'uploads');
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /\.(jpe?g|png|webp|gif)$/i.test(f)).sort() : [];
  const options = files.map((f) => `<option value="img/uploads/${encodeURIComponent(f)}">${esc(f)}</option>`).join('');
  const m = pageMeta.crop;
  write('crop.html', page({ title: m.title, description: m.description, nav: m.nav, showBand: m.band, noindex: m.noindex, main: read('pages', 'crop.html').trim().replace('{{uploads}}', () => options) }));
}

for (const key of ['about', 'get-involved', 'contact', 'thanks']) {
  const m = pageMeta[key];
  write(`${key}.html`, page({ title: m.title, description: m.description, nav: m.nav, showBand: m.band, noindex: m.noindex, main: read('pages', `${key}.html`).trim() }));
}

console.log(`Built ${stories.length} stories (${SHOW_DRAFTS ? 'drafts shown' : 'drafts hidden'}), home page shows ${latest.length}.`);
if (problems.length) console.log('Skipped or incomplete:\n  ' + problems.join('\n  '));
