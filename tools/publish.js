// Run by the "Publish this story" and "Take off live site" buttons in the editor (see .github/workflows/publish.yml).
// It moves ONE story between the drafts copy (branch "drafts") and the live site (branch "main").
// Nothing else on the live site is touched.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const say = (text) => { console.log(text); if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, text + '\n'); };
const stop = (text) => { say('NOT DONE: ' + text); console.log('::error::' + text); process.exit(1); };

let payload = {};
try { payload = JSON.parse(process.env.PAYLOAD || '{}'); } catch (e) { stop('the editor sent details that could not be read.'); }

// 1. Only named editors may publish.
const allowed = String(process.env.PUBLISHERS || '').toLowerCase().split(/\s+/).filter(Boolean);
const by = payload.triggeredBy || {};
const who = [by.githubUsername, by.email].filter(Boolean).map((v) => String(v).toLowerCase());
if (!who.some((w) => allowed.includes(w))) stop(`${by.name || 'you'} are not on the list of people allowed to publish.`);

// 2. Which story, and which button.
const story = String((payload.context || {}).path || '');
if (!/^stories\/[^/\\]+\.json$/.test(story)) stop('this button only works from inside a news story.');
const unpublish = ((payload.action || {}).name || '') === 'unpublish-story';

git('config', 'user.name', 'West Berkshire Voice publisher');
git('config', 'user.email', 'publisher@users.noreply.github.com');
git('fetch', 'origin', 'drafts');

let draftsText;
try { draftsText = git('show', `origin/drafts:${story}`); } catch (e) { stop('that story could not be found. Save it first, then try again.'); }
let data;
try { data = JSON.parse(draftsText); } catch (e) { stop('that story file is damaged and could not be read.'); }
const title = data.title || story;
const flagged = (draft) => JSON.stringify({ ...data, draft }, null, 2) + '\n';
const changed = () => git('status', '--porcelain', '--untracked-files=all', '--', 'stories', 'static') !== '';

// 3. The live site (branch "main", already checked out).
// removed.json lists stories taken off the live site, so their addresses show a "not here" page at once
// instead of a copy that Cloudflare would otherwise keep serving for up to a week.
const slug = path.basename(story, '.json');
let removed = [];
try { removed = JSON.parse(fs.readFileSync('removed.json', 'utf8')); } catch (e) { /* none yet */ }
const setRemoved = (on) => {
  const next = removed.filter((r) => r !== slug);
  if (on) next.push(slug);
  fs.writeFileSync('removed.json', JSON.stringify(next, null, 2) + '\n');
  git('add', '--', 'removed.json');
};
if (unpublish) {
  if (fs.existsSync(story)) git('rm', '-q', '--', story);
  setRemoved(true);
  if (git('diff', '--cached', '--name-only') !== '') git('commit', '-q', '-m', `Take off live site: ${title}`);
} else {
  setRemoved(false);
  fs.writeFileSync(story, flagged(false));
  // Bring the story's own pictures with it.
  const pictures = [...new Set((draftsText.match(/\/img\/[^"\\?#]+/g) || []).map((p) => 'static' + decodeURIComponent(p)))];
  for (const pic of pictures) {
    try { git('cat-file', '-e', `origin/drafts:${pic}`); } catch (e) { continue; }
    git('checkout', 'origin/drafts', '--', pic);
  }
  // Check the live site builds and that this story really appears on it.
  try { execFileSync('node', ['build.js'], { stdio: 'inherit', env: { ...process.env, CF_PAGES_BRANCH: 'main' } }); } catch (e) { stop('the live site would not build with this story. Nothing has been changed.'); }
  const page = path.join('_site', path.basename(story, '.json') + '.html');
  if (!fs.existsSync(page)) stop('this story was held back. Check that it has a headline and a date, and that every picture is uploaded to our own site and is 16:9. The amber warnings on the drafts copy say what to fix.');
  git('add', '--', 'stories', 'static');
  if (git('diff', '--cached', '--name-only') === '') stop('nothing to publish. The saved version of this story is already on the live site. If you have made changes, click Save first, then publish again.');
  git('commit', '-q', '-m', `Publish: ${title}`);
}
const liveCommit = git('rev-parse', 'HEAD');

// 4. Keep the drafts copy in step, so the Draft tick shows the truth.
git('checkout', '-q', '-B', 'drafts-work', 'origin/drafts');
if (Boolean(data.draft) !== unpublish) {
  fs.writeFileSync(story, flagged(unpublish));
  git('add', '--', story);
  git('commit', '-q', '-m', `${unpublish ? 'Mark as draft' : 'Mark as published'}: ${title}`);
  git('push', '-q', 'origin', 'HEAD:drafts');
}

// 5. Make it public.
git('push', '-q', 'origin', `${liveCommit}:main`);
say(unpublish ? `Taken off the live site: "${title}". It will disappear in a minute or two and stays in the editor as a draft.` : `Published: "${title}". It will be on the live site in a minute or two.`);
