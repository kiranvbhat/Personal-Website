# Personal Website
My personal website, built using Jekyll and hosted on GitHub Pages.

<a href="https://www.kiranvbhat.com">kiranvbhat.com</a>

## Editing content
All content lives in `_data/` and is kept separate from the page design:

| File | Contents |
|---|---|
| `_data/profile.yml` | Name, bio, social links and icons, resume, splash door image, hit counter number |
| `_data/nav.yml` | Sidebar menu links, and the clickable gif for each page on the homepage |
| `_data/education.yml` | Education |
| `_data/experience.yml` | Work experience |
| `_data/research.yml` | Research |
| `_data/coding.yml` | Coding projects (set `hidden: true` to hide one) |
| `_data/performances.yml` | Performances |
| `_data/music.yml` | Music page (compositions) |
| `_data/other.yml` | Other page |
| `_data/coursework.yml` | Classes, grouped by subject (shown on the Education page) |
| `_data/credits.yml` | Links on the Credits page (linked from the footer): inspiration and graphics sources |
| `_data/cursors.yml` | Cursors in the cursor menu (settings box): titles and order |

The "last updated" date is filled in automatically with the date the site was built.

Entries can have optional `start` and `end` dates written as `YYYY-MM` (use `end: present` for ongoing things). Experience, Research, Coding and Performances are sorted newest first by those dates; Music and Other keep the order written in their files.

## Design
The site has two appearances, picked with the theme setting in the sidebar (the choice is saved in the visitor's browser):

- **GeoCities** (default): `index.html` (splash page), `home.html` and the other page templates, `_layouts/geocities.html`, `_includes/geo/` and `geocities.css`.
- **Modern**: easy-to-read text with still pictures, and no backgrounds or custom fonts. GIFs are paused on their first frame; to show a different picture there instead (like a plain logo), add a `still:` image under the entry's `media:` (see `_data/education.yml`). Its pages are in `modern/` (each named like its GeoCities page), with `_layouts/modern.html`, `_includes/modern/` and `modern.css`. Visitors who pick it are sent from a GeoCities page to its Modern version, if it has one (see `_includes/modern-url.html`); pages without one, like the guestbook, stay GeoCities. To give a page a Modern version, add a file with the same name to `modern/`; its `title:` becomes its heading. Modern pages tell search engines that their GeoCities page is the main version, so the two don't count as duplicates.

Both use the same `_data/` files, and share some pieces in `_includes/`:
- `appearance-select.html` and `color-setting.html`: the sidebar's theme and color settings. The color choice is shared: picking light in one appearance makes the other light too (Modern follows the device's light or dark mode until one is picked; GeoCities starts dark).
- `section-neighbors.html`: the previous/next section links at the bottom of each section page, in the menu's order (`_data/nav.yml`).
- `dates.html`, `sort-items.html` and `link-name.html`: dates, newest-first sorting, and the Credits pages' link names.

Images live in `assets/`. Each page picks its tiling background with `background:` in its front matter (the block at the top of the page file), optionally with `background_size:` and a dark-mode tint, `background_tint:` (`true`, or a strength like `0.3`). Any `.gif` in `assets/graphics/ads/` is added to the rotation of fake banner ads automatically.

Pictures on the site are shown small, so big ones have a lighter `small` copy next to the original (e.g. `ACMLab small.jpg` next to `ACMLab.png`), and `_data/` points to the copy.

To add a cursor to the cursor menu, make a folder for it in `assets/cursors/originals/` (the folder name is its id) and put its `.cur`/`.ani` files in it, named `cursor` (normal), `link` (hovering links; optional) and `text` (hovering text; optional). Plain images (or `.ico` files) need turning into `.cur` files first. Then run `python3 _scripts/convert_cursors.py` (needs Pillow and PyYAML). It converts them to PNGs in `assets/cursors/web/` and adds the cursor to `_data/cursors.yml`, where you can change its `name`, note its `source`, make it bigger with `size:`, or give it a special `effect:` (`paintbrush`, `darth-vader` or `megumin`). Each effect is a file in `assets/js/cursor-effects/` named after the cursor it was made for; to add one, add a file there named after your cursor's id and set `effect:` to that id (see `core.js` for how). Another cursor can reuse an effect by giving the same name. The originals aren't published (see `exclude:` in `_config.yml`).

The guestbook has two pages: the entries (`guestbook.html`) and the form to sign it (`guestbook-sign.html`). It stores its entries with a small server on Cloudflare, in `guestbook-worker/` (see its README for setup and how spam is kept out). Until `guestbook_api:` in `_config.yml` is set, both pages say "coming soon". Entries can be replied to and deleted from `/guestbook-admin` (not linked anywhere), which needs the admin password.

## Viewing locally
With Docker running:
```
docker run --rm -it -p 4000:4000 -v "$PWD":/srv/jekyll -v jekyll-gems:/usr/local/bundle -w /srv/jekyll ruby:3.3 \
  sh -c "bundle install && bundle exec jekyll serve --host 0.0.0.0 --force_polling"
```
Then open http://localhost:4000. Edits are picked up automatically; refresh the page to see them.

Or, with Ruby 3+ installed locally: `bundle install && bundle exec jekyll serve`.
