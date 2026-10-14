# Roads to Terra: an interactive Horus Heresy reading map

**Live site:** https://rymdstedt.github.io/HorusHeresy/

Every Horus Heresy novel, anthology, Primarchs prequel and Siege of Terra book, drawn as a metro map. Coloured storyline lines all converge on Terra.

- **Pick a route:** *Express* (22 books: the essentials), *Main Campaign* (40), *Completionist* (67), or *Build your own*.
- **Add storylines** such as Prospero, the White Scars, Caliban or Ultramar. Their books are woven into your reading order.
- **Track progress:** tick books off in the reading list. Progress is saved in your browser, and the URL shares your exact route.

## Project layout

| Path | What |
| --- | --- |
| `index.html` | Page shell |
| `css/style.css` | Styles |
| `js/data.js` | **All book and storyline data.** Edit here to change tiers, storylines or blurbs |
| `js/app.js` | Map layout, routing, reading list, storyline cards |
| `js/vendor/d3.min.js` | d3 v7.9.0 (pan and zoom) |

It's a plain static site with no build step. To run it locally:

```sh
python3 -m http.server 8000   # then open http://localhost:8000
```

### Editing the data

Each book in `js/data.js` has:

- `tier`: `core` (Express), `rec` (Main Campaign) or `opt`.
- `arcs`: the storylines it belongs to. The first one decides which lane it sits on.
- `order`: the reading position. Negative values are prequels and values of 100 or more are the Siege of Terra.

The storyline lines and routes are all computed from these fields.

## Hosting

Served by GitHub Pages straight from the `main` branch, root folder (*Settings → Pages → Deploy from a branch*).

---

Unofficial fan project, not affiliated with Games Workshop or Black Library. The Horus Heresy and Warhammer 40,000 are trademarks of Games Workshop Ltd.
