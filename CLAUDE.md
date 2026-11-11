# orca-plugins

Nithin's Orca plugins. One folder, one branch (`main`), one public GitHub repo later.

## The model (Nithin, 2026-11-11)

- **No branches.** Everything happens on `main`.
- **Work stays uncommitted.** Edit plugins in `plugins/<name>/` and leave the changes uncommitted.
  Nothing leaves this Mac until a release.
- **Only `bin/release` commits and pushes.** Never run `git commit`, `git push`, `git tag` or
  `gh repo` yourself. `bin/release <plugin>` commits only that plugin's folder and the catalog,
  so other plugins' unfinished edits never go along.
- **Public = released.** A plugin version is public only once its entry is in `orca-catalog.json`
  on GitHub. Each entry pins a commit, so later pushes never change a released version.

## Commands

Maintainer tools for this repo (need `orca`, `git`, `python3`; `gh` for `--push`). People who use the plugins install them from Orca and never run these.


| Command | What it does |
|---|---|
| `bin/try <plugin>` | Live test copy in Orca (`orca plugin dev watch`): saves reload in about 1 s. Ctrl-C removes it. |
| `bin/use <plugin>` | Install a frozen copy from this folder so it keeps running while you edit (`local.<id>`). Run again to update it. |
| `bin/release <plugin>` | Tests, validator and private-info scan; then commits that plugin and its catalog entry and makes the release tag. Pushes only with `--push`. |

## How running plugins stay safe

- Orca runs installed plugins from its own frozen copies (on macOS `~/Library/Application Support/orca/plugins/<key>/<content hash>/`),
  never from this folder. Editing here changes nothing that runs until `bin/use` or a release.
- A test copy from `bin/try` is `local.<id>`; the released install is `nithinpaul1360.<id>`. Both can be on at once
  (two sidebar icons). Load one test copy of a plugin at a time.

## Writing a plugin

Read `kit/SKILL.md` first, then the reference it points to (`kit/references/`). Start new plugins with
`orca plugin create plugins/<name> --template <template>`. Leave out `publisher`: Orca names it after the
repository owner. Every plugin needs `"license": "MIT"`, a `version`, tests (`orca plugin test`) and,
before release, a `cover` (16:10, at least 800×500) and `screenshots` (at least 1280×800) in `assets/`.

Orca's limits worth knowing (read from Orca 1.4.253's code): a panel may make 120 requests to its
worker per 10 s, and pushed panel messages share that cap and are dropped past it. Panels have no
network. See `plugins/tmux-peek/README.md` for how it stays inside the cap.

## Images

`tools/make-tmux-peek-assets.py <captures-dir>` builds Tmux Peek's cover and screenshots from three
full-resolution Orca window captures named `full-grid.png`, `full-max.png` and `full-narrow.png`
(macOS: `screencapture -o -l <Orca window id>`). The crop boxes fit a 3024×1898 window with the
project list open; adjust `CROP` and `PANEL` for other captures.
