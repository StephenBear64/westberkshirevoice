# West Berkshire Voice website

The site is built by `node build.js` into the `_site` folder (no packages needed).

- `stories/` one JSON file per news story. Edited through Pages CMS or by hand.
- `pages/` the wording of the fixed pages.
- `layout.html` the shared header, menu and footer.
- `static/` stylesheet, icons and pictures.
- `.pages.yml` the settings for the Pages CMS editing form.

Cloudflare Pages settings: build command `node build.js`, build output directory `_site`.
The home page shows the five newest stories; the News page shows all of them.
Stories marked as draft are hidden on the live site and shown on preview copies.

## Drafts and publishing

- Contributors write stories in Pages CMS on the `drafts` branch. New stories are saved as drafts.
- The drafts copy of the site is at https://drafts.westberkshirevoice.pages.dev and shows drafts, marked DRAFT.
- The live site is built from the `main` branch and never shows a story marked as a draft.
- An editor publishes by unticking Draft on the approved stories and merging `drafts` into `main`:
  https://github.com/StephenBear64/westberkshirevoice/compare/main...drafts?expand=1
- With a branch rule on `main` that requires a code owner's approval, only the editors named in `.github/CODEOWNERS` can publish.
