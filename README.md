# Personal Website
My personal website, built using Jekyll and hosted on GitHub Pages.

<a href="https://www.kiranvbhat.com">kiranvbhat.com</a>

## Editing c## Editing content
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
The site has two appearances, picked with the dropdown in the sidebar (the choice is saved in the visitor's browser):

- **GeoCities** (default): `index.html` (splash page), `home.html` and the other page templates, `_layouts/geocities.html`, `_includes/geo/` and `geocities.css`.
- **Modern**: `modern.html`, currently a placeholder.

Images live in `assets/`. Each page picks its tiling background with `background:` in its front matter (the block at the top of the page file). Any `.gif` in `assets/graphics/ads/` is added to the rotation of fake banner ads automatically.

To add a cursor to the cursor menu, add an entry to `_data/cursors.yml` with an `id`, a `name`, and the paths of its original `.cur`/`.ani` files (`file:` under `cursor:` and `pointer:`), then run `python3 _scripts/convert_cursors.py` (needs Pillow and PyYAML). It converts them to PNGs in `assets/cursors/web/` and fills in the rest of the entry. For a folder of Sweezy-style files (`<Name>--cursor--...` and `<Name>--pointer--...`), run `python3 _scripts/convert_cursors.py "<folder>"` to add them all. The original cursor folders are listed under `exclude:` in `_config.yml` so they aren't published.

view
With Docker running:
```
docker run --rm -it -p 4000:4000 -v "$PWD":/srv/jekyll -v jekyll-gems:/usr/local/bundle -w /srv/jekyll ruby:3.3 \
  sh -c "bundle install && bundle exec jekyll serve --host 0.0.0.0 --force_polling"
```
Then open http://localhost:4000. Edits are picked up automatically; refresh the page to see them.

Or, with Ruby 3+ installed locally: `bundle install && bundle exec jekyll serve`.
