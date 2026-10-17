# Standing rules for the West Berkshire Voice website

These rules were set by Bear, who runs the site. Follow them every time.

## The three branches

- **preview**: where every change is made and checked first.
- **main**: the public website that readers see.
- **drafts**: where the CMS editor (Pages CMS) keeps stories that are being written, including unpublished ones.

## Rule 1: preview first, and nothing goes to main without Bear's permission

- Always make changes on the preview branch first.
- Never edit main directly.
- Never copy or push anything from preview to main without Bear's explicit permission.
- There is deliberately no branch protection on main, so that the editor's Publish and Unpublish buttons keep working. That makes this rule the only safeguard, so it must never be skipped.

## Rule 2: keep drafts in step with the live site

- Whenever a change goes live on main, also copy it to the drafts branch.
- Never overwrite or delete `.pages.yml`. It is the editor's settings file and only exists on drafts; without it nobody can write or publish stories.
- Never overwrite or delete anything that only exists on drafts, such as unpublished stories.
- If anything clashes with unpublished drafts, stop and ask Bear first.
