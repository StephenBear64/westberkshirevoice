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
