#!/usr/bin/env python3
"""
Plotline catalog sync.

Builds data/catalog.json from the hand-curated data/seed.json and automatically
adds new and upcoming movies, shows and books as they are released.

Keyless sources (work out of the box):
  - Wikipedia / Wikimedia  : trending articles, release categories, posters, summaries, page views
  - Wikidata (wbgetentities): release dates, genres, cast, IMDb / TMDB / Open Library IDs, networks
  - YouTube                : official trailer lookup + high-res stills for backdrops
  - Open Library           : book covers and reader ratings
  - TVmaze                 : show posters, networks, season premieres (new & upcoming seasons)

Optional keys (set as environment variables, e.g. GitHub Actions secrets):
  TMDB_API_KEY   sharper posters/backdrops, official trailers, live where-to-watch per region
  OMDB_API_KEY   live IMDb ratings
  PLOTLINE_REGIONS  regions for where-to-watch data, default "IN,US,GB"

Usage:
  python tools/sync.py                 # enrich seed + discover new releases + refresh popularity
  python tools/sync.py --no-discover   # only enrich/refresh what is already there
  python tools/sync.py --days 150 --ahead 120 --max-new 40
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SEED_PATH = ROOT / "data" / "seed.json"
OUT_PATH = ROOT / "data" / "catalog.json"
CACHE_DIR = ROOT / "data" / ".cache"

# Wikimedia asks API clients to send a descriptive User-Agent.
WIKI_UA = "PlotlineSync/1.0 (personal movie/book recommendation site; python-urllib)"
BROWSER_UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
              "(KHTML, like Gecko) Chrome/130.0 Safari/537.36")

TMDB_KEY = os.environ.get("TMDB_API_KEY", "").strip()
OMDB_KEY = os.environ.get("OMDB_API_KEY", "").strip()
REGIONS = [r.strip().upper() for r in os.environ.get("PLOTLINE_REGIONS", "IN,US,GB").split(",") if r.strip()]

TODAY = dt.date.today()


# ───────────────────────────── HTTP helpers ─────────────────────────────

def http(url: str, *, ua: str = WIKI_UA, headers: dict | None = None, retries: int = 5, timeout: int = 60,
         quiet: bool = False):
    """GET a URL and return (status, text). Retries politely on 429/5xx and network errors."""
    hdrs = {"User-Agent": ua, "Accept-Language": "en-US,en;q=0.9"}
    if headers:
        hdrs.update(headers)
    status = 0
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=hdrs), timeout=timeout) as r:
                return r.status, r.read().decode("utf-8", "ignore")
        except urllib.error.HTTPError as e:
            status = e.code
            if e.code in (429, 500, 502, 503, 504) and attempt < retries - 1:
                wait = e.headers.get("Retry-After", "")
                time.sleep(min(30, int(wait)) if wait.isdigit() else 2 ** attempt)
                continue
            break
        except Exception:
            status = 0
            if attempt < retries - 1:
                time.sleep(2 ** attempt)
                continue
    if not quiet and status not in (401, 404):
        log(f"  ! HTTP {status or 'error'} {url[:110]}")
    return status, ""


def get_json(url: str, **kw):
    status, text = http(url, **kw)
    if status != 200 or not text:
        return None
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None


def wiki_api(params: dict, host: str = "en.wikipedia.org"):
    params = {**params, "format": "json", "formatversion": "2"}
    return get_json(f"https://{host}/w/api.php?" + urllib.parse.urlencode(params)) or {}


def chunks(seq, n):
    seq = list(seq)
    for i in range(0, len(seq), n):
        yield seq[i:i + n]


def clean_img(url: str | None) -> str | None:
    if not url:
        return None
    return url.split("?utm_source")[0]


def log(*a):
    print(*a, flush=True)


# ───────────────────────────── Wikipedia ─────────────────────────────

def wiki_pages(titles: list[str], light: bool = False) -> dict[str, dict]:
    """Batch lookup: qid, poster image, 30-day page views. Keyed by the *requested* title.
    light=True skips images and page views (much faster) for first-pass filtering."""
    def one_batch(batch):
        result = {}
        params = {
            "action": "query", "titles": "|".join(batch), "redirects": "1",
            "prop": "pageprops|description" if light else "pageprops|pageimages|pageviews|description",
            "ppprop": "wikibase_item", "piprop": "original", "pilicense": "any", "pvipdays": "30",
        }
        alias, pages, cont = {}, {}, {}
        # Page views come back in slices; follow "continue" until every page has its numbers.
        for _ in range(12):
            d = wiki_api({**params, **cont})
            q = d.get("query", {})
            for kind in ("normalized", "redirects"):
                for m in q.get(kind, []):
                    alias[m["from"]] = m["to"]
            for p in q.get("pages", []):
                prev = pages.setdefault(p["title"], {})
                for k, v in p.items():
                    if v or k not in prev:
                        prev[k] = v
            if "continue" not in d:
                break
            cont = d["continue"]

        def resolve(t):
            seen = 0
            while t in alias and seen < 5:
                t, seen = alias[t], seen + 1
            return t

        for t in batch:
            p = pages.get(resolve(t))
            if not p or p.get("missing") or p.get("invalid"):
                continue
            orig = p.get("original") or {}
            views = sum(v or 0 for v in (p.get("pageviews") or {}).values())
            result[t] = {
                "title": p["title"],
                "qid": (p.get("pageprops") or {}).get("wikibase_item"),
                "img": clean_img(orig.get("source")),
                "w": orig.get("width"), "h": orig.get("height"),
                "views30": views,
                "desc": p.get("description") or "",
            }
        return result

    out: dict[str, dict] = {}
    with ThreadPoolExecutor(2) as ex:
        for part in ex.map(one_batch, chunks(sorted(set(t for t in titles if t)), 50)):
            out.update(part)
    return out


def wiki_summary(title: str) -> str | None:
    d = get_json("https://en.wikipedia.org/api/rest_v1/page/summary/" + urllib.parse.quote(title.replace(" ", "_"), safe=""))
    if not d or d.get("type") == "disambiguation":
        return None
    text = (d.get("extract") or "").strip()
    if not text:
        return None
    # Keep it short: first two sentences.
    sentences = re.split(r"(?<=[.!?])\s+", text)
    return " ".join(sentences[:2])[:420]


def top_articles(days: int = 7) -> list[str]:
    """Most-viewed English Wikipedia articles over the past few days (trending)."""
    titles: list[str] = []
    for back in range(1, days + 1):
        day = TODAY - dt.timedelta(days=back)
        d = get_json(f"https://wikimedia.org/api/rest_v1/metrics/pageviews/top/en.wikipedia/all-access/{day:%Y/%m/%d}")
        if not d:
            continue
        for a in d["items"][0]["articles"]:
            name = a["article"]
            if name == "Main_Page" or ":" in name.split("_")[0] or name.startswith(("Special:", "Wikipedia:", "File:", "Portal:")):
                continue
            titles.append(name.replace("_", " "))
    return list(dict.fromkeys(titles))


def category_members(cat: str, pages: int = 3) -> list[str]:
    """Most recently added articles in a Wikipedia category."""
    out, cont = [], {}
    for _ in range(pages):
        d = wiki_api({"action": "query", "list": "categorymembers", "cmtitle": cat, "cmtype": "page",
                      "cmnamespace": "0", "cmlimit": "50", "cmsort": "timestamp", "cmdir": "desc", **cont})
        out += [m["title"] for m in d.get("query", {}).get("categorymembers", [])]
        if "continue" not in d:
            break
        cont = {"cmcontinue": d["continue"]["cmcontinue"]}
    return out


# ───────────────────────────── Wikidata ─────────────────────────────

FILM_TYPES = {"Q11424", "Q24869", "Q202866", "Q29168811", "Q506240", "Q93204"}
TV_TYPES = {"Q5398426", "Q1259759", "Q526877", "Q63952888", "Q581714", "Q117467246", "Q7724161"}
SEASON_TYPES = {"Q3464665"}
BOOK_TYPES = {"Q7725634", "Q8261", "Q571", "Q47461344", "Q1279564"}
PREFERRED_PLACES = {"Q30", "Q668", "Q145"}  # US, India, UK release dates


def wd_entities(ids: list[str], props: str = "claims") -> dict[str, dict]:
    out = {}
    todo = sorted(set(i for i in ids if i))
    for attempt in range(3):
        for batch in chunks(todo, 25):
            d = wiki_api({"action": "wbgetentities", "ids": "|".join(batch), "props": props, "languages": "en",
                          "sitefilter": "enwiki", "maxlag": "5"}, host="www.wikidata.org")
            out.update({k: v for k, v in d.get("entities", {}).items() if "missing" not in v})
            time.sleep(0.2)
        todo = [i for i in todo if i not in out]
        if not todo:
            break
        log(f"  … retrying {len(todo)} Wikidata entities")
        time.sleep(5)
    return out


def _statements(c, p):
    sts = [s for s in c.get(p, []) if s.get("rank") != "deprecated" and s["mainsnak"].get("snaktype") == "value"]
    preferred = [s for s in sts if s.get("rank") == "preferred"]
    return preferred or sts


def claim_ids(c, p):
    return [s["mainsnak"]["datavalue"]["value"].get("id") for s in _statements(c, p)
            if isinstance(s["mainsnak"]["datavalue"]["value"], dict)]


def claim_str(c, p):
    for s in _statements(c, p):
        v = s["mainsnak"]["datavalue"]["value"]
        if isinstance(v, str):
            return v
    return None


def claim_qty(c, p):
    for s in _statements(c, p):
        v = s["mainsnak"]["datavalue"]["value"]
        if isinstance(v, dict) and "amount" in v:
            try:
                return float(v["amount"])
            except ValueError:
                pass
    return None


def claim_date(c, props=("P577", "P580")):
    """Pick a sensible release date: prefer US/India/UK releases, else the earliest precise date."""
    cands = []
    for p in props:
        for s in _statements(c, p):
            v = s["mainsnak"]["datavalue"]["value"]
            if not isinstance(v, dict) or "time" not in v or v.get("precision", 0) < 10:
                continue
            m = re.match(r"\+(\d{4})-(\d{2})-(\d{2})", v["time"])
            if not m:
                continue
            y, mo, d = int(m[1]), max(1, int(m[2])), max(1, int(m[3]))
            try:
                date = dt.date(y, mo, d)
            except ValueError:
                continue
            places = {q["datavalue"]["value"]["id"] for q in s.get("qualifiers", {}).get("P291", [])
                      if q.get("snaktype") == "value"}
            cands.append((0 if places & PREFERRED_PLACES else 1, date))
        if cands:
            break
    if not cands:
        return None
    best = min(c[0] for c in cands)
    return min(d for rank, d in cands if rank == best)


def classify(c) -> str | None:
    p31 = set(claim_ids(c, "P31"))
    if p31 & SEASON_TYPES:
        return "season"
    if p31 & TV_TYPES:
        return "show"
    if p31 & FILM_TYPES:
        return "movie"
    if p31 & BOOK_TYPES:
        return "book"
    return None


class Labels:
    """Cached Wikidata labels (and ISO codes for languages)."""

    def __init__(self):
        self.path = CACHE_DIR / "labels.json"
        try:
            self.data = json.loads(self.path.read_text("utf-8"))
        except Exception:
            self.data = {}

    def fetch(self, ids):
        missing = [i for i in set(ids) if i and i not in self.data]
        for qid, e in wd_entities(missing, props="labels|claims").items():
            label = (e.get("labels", {}).get("en") or {}).get("value")
            iso = claim_str(e.get("claims", {}), "P218")
            self.data[qid] = {"l": label, "iso": iso}

    def label(self, qid):
        return (self.data.get(qid) or {}).get("l")

    def iso(self, qid):
        return (self.data.get(qid) or {}).get("iso")

    def save(self):
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(self.data, ensure_ascii=False), "utf-8")


GENRE_RULES = [
    ("science fiction", ["scifi"]), ("sci-fi", ["scifi"]), ("dystopia", ["scifi"]), ("cyberpunk", ["scifi"]),
    ("superhero", ["action", "scifi"]), ("fantasy", ["fantasy"]), ("horror", ["horror"]), ("slasher", ["horror"]),
    ("comedy", ["comedy"]), ("sitcom", ["comedy"]), ("satir", ["comedy"]), ("parody", ["comedy"]),
    ("thriller", ["thriller"]), ("spy", ["thriller"]), ("suspense", ["thriller"]),
    ("action", ["action"]), ("martial arts", ["action"]), ("adventure", ["adventure"]),
    ("animat", ["animation"]), ("anime", ["animation"]), ("crime", ["crime"]), ("heist", ["crime"]),
    ("gangster", ["crime"]), ("police", ["crime"]), ("legal", ["drama"]), ("medical", ["drama"]),
    ("mystery", ["mystery"]), ("detective", ["mystery"]), ("whodunit", ["mystery"]),
    ("romance", ["romance"]), ("romantic", ["romance"]), ("love story", ["romance"]),
    ("historical", ["historical"]), ("period", ["historical"]), ("war", ["historical"]),
    ("biographical", ["historical"]), ("musical", ["musical"]), ("music", ["musical"]),
    ("family", ["family"]), ("children", ["family"]), ("young adult", ["ya"]), ("coming-of-age", ["drama"]),
    ("drama", ["drama"]), ("documentary", ["documentary"]), ("literary", ["literary"]),
    ("memoir", ["memoir"]), ("autobiograph", ["memoir"]), ("biography", ["memoir"]),
    ("self-help", ["selfhelp"]), ("non-fiction", ["nonfiction"]), ("nonfiction", ["nonfiction"]),
    ("essay", ["nonfiction"]), ("popular science", ["nonfiction"]),
]

MOODS_BY_GENRE = {
    "horror": ["dark", "thrilling"], "thriller": ["thrilling", "dark"], "crime": ["dark", "thrilling"],
    "comedy": ["funny", "feelgood"], "romance": ["emotional"], "drama": ["emotional"],
    "animation": ["feelgood"], "family": ["cozy", "feelgood"], "fantasy": ["epic"], "adventure": ["epic"],
    "scifi": ["mindbending", "epic"], "mystery": ["mindbending", "thrilling"], "historical": ["epic", "emotional"],
    "musical": ["feelgood"], "action": ["thrilling"], "ya": ["thrilling"], "literary": ["emotional"],
    "memoir": ["emotional"], "nonfiction": ["mindbending"], "selfhelp": ["feelgood"],
}

NETWORK_RULES = [
    ("netflix", "netflix"), ("prime video", "prime"), ("amazon", "prime"), ("apple", "apple"),
    ("hbo", "hbo"), ("max", "hbo"), ("warner bros", "hbo"), ("disney+ hotstar", "jiohotstar"),
    ("jiohotstar", "jiohotstar"), ("jiocinema", "jiohotstar"), ("hotstar", "jiohotstar"),
    ("disney", "disney"), ("marvel", "disney"), ("lucasfilm", "disney"), ("20th century", "disney"),
    ("searchlight", "disney"), ("pixar", "disney"), ("hulu", "fx"), ("fx", "fx"), ("peacock", "universal"),
    ("universal", "universal"), ("focus features", "universal"), ("nbc", "universal"),
    ("paramount", "paramount"), ("cbs", "paramount"), ("showtime", "paramount"), ("sonyliv", "sonyliv"),
    ("sony liv", "sonyliv"), ("zee5", "zee5"), ("crunchyroll", "crunchyroll"), ("bbc", "bbc"),
]


def map_genres(labels: list[str], kind: str) -> list[str]:
    out = []
    for lab in labels:
        low = (lab or "").lower()
        for needle, gs in GENRE_RULES:
            if needle in low:
                out += gs
    if kind != "book":  # book-only genres on screen titles
        out = [{"memoir": "historical", "nonfiction": "documentary", "literary": "drama", "ya": "drama"}.get(g, g) for g in out]
    out = list(dict.fromkeys(g for g in out if g != "documentary" or kind != "book"))
    if kind == "book" and not out:
        out = ["literary"]
    if kind != "book" and not out:
        out = ["drama"]
    return out[:4]


def infer_moods(genres):
    moods = []
    for g in genres:
        moods += MOODS_BY_GENRE.get(g, [])
    return list(dict.fromkeys(moods))[:3] or ["emotional"]


def map_networks(labels: list[str]) -> list[str]:
    out = []
    for lab in labels:
        low = (lab or "").lower()
        for needle, key in NETWORK_RULES:
            if needle in low:
                out.append(key)
                break
    return list(dict.fromkeys(out))[:2]


# ───────────────────────────── YouTube ─────────────────────────────

STOP = {"the", "and", "of", "a", "an", "to", "in", "on", "for", "with", "season", "film", "series", "official", "trailer"}


def _tokens(s):
    return {t for t in re.findall(r"[a-z0-9]+", s.lower()) if len(t) >= 3 and t not in STOP}


def find_trailer(item) -> tuple[str | None, str | None]:
    """Return (youtube_id, backdrop_url)."""
    year = item.get("year") or ""
    query = item.get("yt") or f"{item['title']} {year} official trailer"
    status, html = http("https://www.youtube.com/results?search_query=" + urllib.parse.quote(query), ua=BROWSER_UA)
    if status != 200:
        return None, None
    ids = list(dict.fromkeys(re.findall(r'"videoId":"([\w-]{11})"', html)))[:8]
    want = _tokens(item["title"])
    chosen = None
    for vid in ids:
        meta = get_json("https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v=" + vid,
                        ua=BROWSER_UA, retries=2, quiet=True)
        if not meta:  # 401 = embedding disabled, 404 = gone
            continue
        title = meta.get("title", "")
        low = title.lower()
        if ("trailer" in low or "teaser" in low) and (not want or want & _tokens(title)):
            chosen = vid
            break
    if not chosen:
        return None, None
    status, _ = http(f"https://i.ytimg.com/vi/{chosen}/maxresdefault.jpg", ua=BROWSER_UA, retries=2, quiet=True)
    backdrop = f"https://i.ytimg.com/vi/{chosen}/maxresdefault.jpg" if status == 200 else None
    return chosen, backdrop


# ───────────────────────────── Open Library ─────────────────────────────

def open_library(item) -> dict:
    author = (item.get("creators") or [""])[0]
    q = urllib.parse.urlencode({"title": item["title"], "author": author, "limit": 5,
                                "fields": "key,title,cover_i,ratings_average,ratings_count,number_of_pages_median"})
    d = get_json("https://openlibrary.org/search.json?" + q) or {}
    want = _tokens(item["title"])
    for doc in d.get("docs", []):
        if want and not (want & _tokens(doc.get("title", ""))):
            continue
        out = {"olid": doc["key"].split("/")[-1]}
        if doc.get("cover_i"):
            out["cover"] = f"https://covers.openlibrary.org/b/id/{doc['cover_i']}-L.jpg"
        if doc.get("ratings_count"):
            out["olRating"] = round(doc["ratings_average"], 2)
            out["olCount"] = doc["ratings_count"]
        if doc.get("number_of_pages_median") and not item.get("pages"):
            out["pages"] = doc["number_of_pages_median"]
        return out
    return {}


# ───────────────────────────── TVmaze (shows) ─────────────────────────────

_tvmaze_last = [0.0]


def tvmaze_get(path: str):
    # TVmaze allows ~20 requests / 10 s; stay comfortably under it.
    wait = 0.6 - (time.time() - _tvmaze_last[0])
    if wait > 0:
        time.sleep(wait)
    _tvmaze_last[0] = time.time()
    return get_json("https://api.tvmaze.com/" + path, quiet=True)


def tvmaze(item, refresh: bool = False) -> dict:
    """Poster, network and season info for a show. Season data is refreshed every run."""
    sid = item.get("tvmazeId")
    out = {}
    if not sid or refresh:
        show = tvmaze_get(f"lookup/shows?imdb={item['imdbId']}") if item.get("imdbId") else None
        if not show:
            cand = tvmaze_get("singlesearch/shows?q=" + urllib.parse.quote(item["title"]))
            year = int(cand["premiered"][:4]) if cand and cand.get("premiered") else None
            if cand and _tokens(item["title"]) & _tokens(cand.get("name", "")) and (not item.get("year") or not year or abs(year - item["year"]) <= 1):
                show = cand
        if not show:
            return {}
        sid = show["id"]
        out["tvmazeId"] = sid
        img = (show.get("image") or {}).get("original")
        if img:
            out["poster"], out["posterW"], out["posterH"] = img, 680, 1000
        net = (show.get("webChannel") or {}).get("name") or (show.get("network") or {}).get("name")
        if net:
            out["network"] = net
            if not item.get("providers") and item.get("source") == "auto":
                out["providers"] = map_networks([net])
        if not item.get("synopsis") and show.get("summary"):
            text = re.sub(r"<[^>]+>", "", show["summary"]).strip()
            out["synopsis"] = " ".join(re.split(r"(?<=[.!?])\s+", text)[:2])[:420]
            out["synopsisSource"] = "tvmaze"
    seasons = tvmaze_get(f"shows/{sid}/seasons") or []
    today = TODAY.isoformat()
    aired = [x for x in seasons if x.get("premiereDate") and x["premiereDate"] <= today]
    future = sorted((x for x in seasons if x.get("premiereDate") and x["premiereDate"] > today), key=lambda x: x["premiereDate"])
    if aired:
        latest = max(aired, key=lambda x: x["premiereDate"])
        out["seasons"] = max(x.get("number") or 0 for x in aired) or len(aired)
        if not item.get("released") or latest["premiereDate"] > item["released"]:
            out["released"] = latest["premiereDate"]
            recent = (TODAY - dt.date.fromisoformat(latest["premiereDate"])).days <= 60
            if item.get("released") and latest.get("number", 1) > 1 and recent:
                out["newSeason"] = True
        out["latestSeason"] = latest.get("number")
    out["nextSeason"] = {"number": future[0].get("number"), "date": future[0]["premiereDate"]} if future else None
    return out


# ───────────────────────────── Optional: TMDB / OMDb ─────────────────────────────

def tmdb(path: str, **params):
    if not TMDB_KEY:
        return None
    headers = {}
    if len(TMDB_KEY) > 40:  # v4 read-access token
        headers["Authorization"] = f"Bearer {TMDB_KEY}"
    else:
        params["api_key"] = TMDB_KEY
    return get_json(f"https://api.themoviedb.org/3/{path}?" + urllib.parse.urlencode(params), headers=headers)


def tmdb_enrich(item):
    t = item.get("tmdb")
    if not t:
        return {}
    d = tmdb(f"{t['type']}/{t['id']}", append_to_response="videos,watch/providers")
    if not d:
        return {}
    out = {}
    if d.get("poster_path"):
        out["poster"] = "https://image.tmdb.org/t/p/w500" + d["poster_path"]
        out["posterW"], out["posterH"] = 500, 750
    if d.get("backdrop_path"):
        out["backdrop"] = "https://image.tmdb.org/t/p/w1280" + d["backdrop_path"]
    if d.get("vote_average"):
        out["tmdbRating"] = round(d["vote_average"], 1)
    vids = [v for v in (d.get("videos") or {}).get("results", []) if v.get("site") == "YouTube"]
    vids.sort(key=lambda v: (v.get("type") != "Trailer", not v.get("official"), v.get("published_at", "")))
    if vids:
        out["trailer"] = vids[0]["key"]
    provs = (d.get("watch/providers") or {}).get("results", {})
    live = {}
    for region in REGIONS:
        r = provs.get(region) or {}
        names = [p["provider_name"] for p in r.get("flatrate", [])][:4]
        rent = bool(r.get("rent") or r.get("buy"))
        if names or rent:
            live[region] = {"stream": names, "rent": rent, "link": r.get("link")}
    if live:
        out["liveProviders"] = live
    return out


def omdb_rating(imdb_id: str):
    if not OMDB_KEY or not imdb_id:
        return None
    d = get_json(f"https://www.omdbapi.com/?i={imdb_id}&apikey={OMDB_KEY}")
    try:
        return float(d["imdbRating"]) if d and d.get("imdbRating") not in (None, "N/A") else None
    except (TypeError, ValueError):
        return None


# ───────────────────────────── Building items ─────────────────────────────

def pop_score(views30: int) -> int:
    return max(1, min(100, round(16 * math.log10((views30 or 0) + 1))))


def apply_wikidata(item: dict, c: dict, labels: Labels, full: bool):
    """Copy IDs from Wikidata into an item; with full=True also fill descriptive fields."""
    imdb = claim_str(c, "P345")
    if imdb and imdb.startswith("tt"):
        item.setdefault("imdbId", imdb)
    if claim_str(c, "P4947"):
        item.setdefault("tmdb", {"type": "movie", "id": claim_str(c, "P4947")})
    elif claim_str(c, "P4983"):
        item.setdefault("tmdb", {"type": "tv", "id": claim_str(c, "P4983")})
    if claim_str(c, "P648"):
        item.setdefault("olid", claim_str(c, "P648"))
    if not full:
        return
    kind = item["type"]
    date = claim_date(c)
    if date:
        item["released"] = date.isoformat()
        item["year"] = date.year
    item["genres"] = map_genres([labels.label(g) for g in claim_ids(c, "P136")], kind)
    item["moods"] = infer_moods(item["genres"])
    lang_ids = claim_ids(c, "P364") or claim_ids(c, "P407")
    item["lang"] = next((labels.iso(l) for l in lang_ids if labels.iso(l)), "en")
    people = claim_ids(c, "P50") if kind == "book" else (claim_ids(c, "P57") or claim_ids(c, "P170"))
    item["creators"] = [labels.label(p) for p in people[:3] if labels.label(p)]
    if kind != "book":
        item["cast"] = [labels.label(p) for p in claim_ids(c, "P161")[:4] if labels.label(p)]
        nets = claim_ids(c, "P449") + claim_ids(c, "P750")
        item["providers"] = map_networks([labels.label(n) for n in nets]) or ["rent" if kind == "movie" else ""]
        item["providers"] = [p for p in item["providers"] if p]
    else:
        item["providers"] = []
    if kind == "movie" and claim_qty(c, "P2047"):
        item["runtime"] = int(claim_qty(c, "P2047"))
    if kind == "show" and claim_qty(c, "P2437"):
        item["seasons"] = int(claim_qty(c, "P2437"))
    if kind == "book" and claim_qty(c, "P1104"):
        item["pages"] = int(claim_qty(c, "P1104"))


def label_refs(c):
    refs = []
    for p in ("P136", "P364", "P407", "P50", "P57", "P170", "P161", "P449", "P750"):
        refs += claim_ids(c, p)[:6]
    return refs


def discover(catalog: dict, labels: Labels, days: int, ahead: int, max_new: int):
    """Find new/upcoming releases that are not yet in the catalog."""
    known_qids = {it.get("qid") for it in catalog.values() if it.get("qid")}
    years = sorted({TODAY.year, (TODAY - dt.timedelta(days=days)).year, (TODAY + dt.timedelta(days=ahead)).year})

    log("· scanning trending articles (7 days)…")
    candidates = top_articles(7)
    log(f"  {len(candidates)} trending titles")
    cats = []
    for y in years:
        cats += [f"Category:{y} films", f"Category:{y} American television series debuts",
                 f"Category:{y} British television series debuts", f"Category:{y} Indian television series debuts",
                 f"Category:{y} South Korean television series debuts", f"Category:{y} American television seasons",
                 f"Category:{y} American novels", f"Category:{y} British novels", f"Category:{y} Indian novels",
                 f"Category:{y} English-language novels", f"Category:{y} speculative fiction novels",
                 f"Category:{y} non-fiction books"]
    log(f"· scanning {len(cats)} release categories…")
    with ThreadPoolExecutor(2) as ex:
        for members in ex.map(category_members, cats):
            candidates += members
    candidates = list(dict.fromkeys(candidates))
    log(f"  {len(candidates)} candidate articles")

    # Fast first pass on short descriptions, then the slower page-view lookup on what's left.
    first = wiki_pages(candidates, light=True)
    media = re.compile(r"\b(film|movie|novel|novella|book|memoir|miniseries|sitcom|anime|docuseries|web series|"
                       r"television series|tv series|television program|streaming series|season of)\b", re.I)
    person = re.compile(r"\b(actor|actress|director|producer|screenwriter|writer|author|novelist|singer|presenter|host|"
                        r"filmmaker|critic|executive|player|politician|comedian|musician|rapper|model|journalist|"
                        r"cinematographer|editor|composer|personality|born)\b", re.I)
    likely = [t for t, p in first.items() if p.get("qid") and p["qid"] not in known_qids
              and media.search(p["desc"]) and not person.search(p["desc"])]
    log(f"  {len(likely)} look like films, shows or books")
    pages = {t: p for t, p in wiki_pages(likely).items() if p["views30"] >= 600}
    ents = wd_entities([p["qid"] for p in pages.values()])
    lo, hi = TODAY - dt.timedelta(days=days), TODAY + dt.timedelta(days=ahead)
    min_views = {"movie": 25000, "show": 25000, "season": 8000, "book": 600}

    found, season_updates = [], []
    for t, p in pages.items():
        e = ents.get(p["qid"]) or {}
        c = e.get("claims", {})
        kind = classify(c)
        if not kind:
            continue
        date = claim_date(c)
        if not date or not (lo <= date <= hi):
            continue
        if p["views30"] < min_views[kind]:
            continue
        if kind == "season":
            series = claim_ids(c, "P179")
            if series:
                ordinal = None
                for s in c.get("P179", []):
                    for q in s.get("qualifiers", {}).get("P1545", []):
                        ordinal = q.get("datavalue", {}).get("value")
                season_updates.append((series[0], date, ordinal, p["views30"]))
            continue
        found.append((p["views30"], kind, t, p, c, date))

    # New seasons: refresh shows we know, add shows we don't.
    by_qid = {it.get("qid"): it for it in catalog.values() if it.get("qid")}
    new_series = {}
    for sqid, date, ordinal, views in season_updates:
        if sqid in by_qid:
            show = by_qid[sqid]
            if not show.get("released") or show["released"] < date.isoformat():
                show["released"] = date.isoformat()
                if ordinal and str(ordinal).isdigit():
                    show["latestSeason"] = int(ordinal)
                    show["seasons"] = max(show.get("seasons") or 0, int(ordinal))
                show["newSeason"] = True
                log(f"  ↻ new season: {show['title']} ({date})")
        elif sqid not in new_series or new_series[sqid][1] < date:
            new_series[sqid] = (ordinal, date, views)
    if new_series:
        series_ents = wd_entities(list(new_series), props="claims|sitelinks")
        for sqid, (ordinal, date, views) in new_series.items():
            e = series_ents.get(sqid) or {}
            title = ((e.get("sitelinks") or {}).get("enwiki") or {}).get("title")
            if not title or sqid in known_qids:
                continue
            sp = wiki_pages([title]).get(title)
            if not sp:
                continue
            found.append((views + sp["views30"], "show", title, sp, e.get("claims", {}), date))

    # Skip reality, talk, game and sports programming: not what people come here for.
    labels.fetch(g for f in found for g in claim_ids(f[4], "P136"))
    unscripted = re.compile(r"reality|talk show|game show|news|sport|variety|award|competition|dating", re.I)
    found = [f for f in found if not any(unscripted.search(labels.label(g) or "") for g in claim_ids(f[4], "P136"))]
    # Books get far less traffic than films, so rank them separately to make sure a few make it in.
    books = sorted((f for f in found if f[1] == "book"), key=lambda x: -x[0])[: max(4, max_new // 5)]
    screen = sorted((f for f in found if f[1] != "book"), key=lambda x: -x[0])[: max_new - len(books)]
    found = screen + books
    labels.fetch(r for f in found for r in label_refs(f[4]))

    added = []
    for views, kind, t, p, c, date in found:
        item = {
            "id": f"wd-{p['qid']}", "qid": p["qid"], "type": kind, "title": re.sub(r"\s*\([^)]*\b(?:film|series|miniseries|novel|book|TV)\b[^)]*\)$", "", p["title"]),
            "wiki": p["title"], "source": "auto", "added": TODAY.isoformat(),
        }
        apply_wikidata(item, c, labels, full=True)
        item["released"] = date.isoformat()
        item["year"] = date.year
        if p.get("img"):
            item["poster"], item["posterW"], item["posterH"] = p["img"], p["w"], p["h"]
        item["views30"] = p["views30"]
        catalog[item["id"]] = item
        added.append(item)
        log(f"  + {kind:5} {date}  {item['title']}")
    return added


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--days", type=int, default=150, help="how far back counts as a recent release")
    ap.add_argument("--ahead", type=int, default=120, help="how far ahead to include upcoming releases")
    ap.add_argument("--max-new", type=int, default=40, help="max new titles to add per run")
    ap.add_argument("--no-discover", action="store_true", help="skip new-release discovery")
    ap.add_argument("--refresh", action="store_true", help="re-fetch trailers, posters and covers")
    args = ap.parse_args()

    started = time.time()
    seed = json.loads(SEED_PATH.read_text("utf-8"))
    previous = {}
    if OUT_PATH.exists():
        try:
            previous = {it["id"]: it for it in json.loads(OUT_PATH.read_text("utf-8"))["items"]}
        except Exception:
            previous = {}

    # Seed entries win over cached copies for hand-written fields; cached enrichment is kept.
    catalog: dict[str, dict] = {}
    for s in seed:
        merged = {**previous.get(s["id"], {}), **{k: v for k, v in s.items()}}
        merged["source"] = "seed"
        catalog[s["id"]] = merged
    for iid, it in previous.items():
        if iid not in catalog and it.get("source") == "auto":
            catalog[iid] = it
    seed_qids = set()

    labels = Labels()

    # 1 ─ resolve Wikipedia pages (posters, qids, views) for everything
    log(f"· resolving {len(catalog)} Wikipedia pages…")
    pages = wiki_pages([it["wiki"] for it in catalog.values() if it.get("wiki")])
    season_titles = {}
    for it in catalog.values():
        p = pages.get(it.get("wiki"))
        if not p:
            log(f"  ! no Wikipedia page for {it['title']} ({it.get('wiki')})")
            continue
        it["qid"] = p["qid"] or it.get("qid")
        it["views30"] = p["views30"]
        if it["source"] == "seed" and p["qid"]:
            seed_qids.add(p["qid"])
        if args.refresh or not it.get("poster") or "wikimedia" in (it.get("poster") or ""):
            img, w, h = p.get("img"), p.get("w"), p.get("h")
            if img and w and h and w > h * 1.05:  # landscape title card, not a poster
                it["titleCard"] = img
                img = None
            if img:
                it["poster"], it["posterW"], it["posterH"] = img, w, h
            elif it["type"] == "show":
                base = re.sub(r"\s*\(.*\)$", "", it["wiki"])
                season_titles[it["id"]] = [f"{it['wiki']} season 1", f"{base} season 1"]

    # Drop auto entries that duplicate a curated seed title.
    for iid in [i for i, it in catalog.items() if it.get("source") == "auto" and it.get("qid") in seed_qids]:
        del catalog[iid]

    if season_titles:
        sp = wiki_pages([t for ts in season_titles.values() for t in ts])
        for iid, ts in season_titles.items():
            for t in ts:
                p = sp.get(t)
                if p and p.get("img") and p.get("h") and p["h"] >= p["w"]:
                    it = catalog[iid]
                    it["poster"], it["posterW"], it["posterH"] = p["img"], p["w"], p["h"]
                    break

    # 2 ─ Wikidata IDs (IMDb, TMDB, Open Library)
    log("· reading Wikidata…")
    ents = wd_entities([it["qid"] for it in catalog.values() if it.get("qid")])
    for it in catalog.values():
        e = ents.get(it.get("qid") or "")
        if e:
            apply_wikidata(it, e.get("claims", {}), labels, full=False)

    # 3 ─ discover new releases
    if not args.no_discover:
        log("· discovering new releases…")
        added = discover(catalog, labels, args.days, args.ahead, args.max_new)
        log(f"  {len(added)} new titles added")

    # 4 ─ summaries for auto items
    need_summary = [it for it in catalog.values() if it.get("source") == "auto" and not it.get("synopsis")]
    if need_summary:
        log(f"· fetching {len(need_summary)} summaries…")
        with ThreadPoolExecutor(2) as ex:
            for it, text in zip(need_summary, ex.map(lambda i: wiki_summary(i["wiki"]), need_summary)):
                if text:
                    it["synopsis"], it["synopsisSource"] = text, "wikipedia"

    # 5 ─ optional TMDB enrichment (official trailers, sharp art, live providers)
    if TMDB_KEY:
        screen = [it for it in catalog.values() if it["type"] != "book" and it.get("tmdb")]
        log(f"· TMDB enrichment for {len(screen)} titles…")
        with ThreadPoolExecutor(6) as ex:
            for it, extra in zip(screen, ex.map(tmdb_enrich, screen)):
                it.update(extra)

    # 5b ─ TVmaze: show posters + new/upcoming seasons
    shows = [it for it in catalog.values() if it["type"] == "show"]
    log(f"· TVmaze for {len(shows)} shows…")
    for it in shows:
        extra = tvmaze(it, refresh=args.refresh)
        if (it.get("poster") or "").startswith("https://image.tmdb.org"):
            extra.pop("poster", None)
        if extra.get("newSeason") and not it.get("newSeason"):
            log(f"  ↻ new season: {it['title']} (season {extra.get('latestSeason')}, {extra.get('released')})")
        it.update(extra)
        if not it.get("nextSeason"):
            it.pop("nextSeason", None)

    # 6 ─ trailers + backdrops from YouTube
    need_trailer = [it for it in catalog.values() if it["type"] != "book" and (args.refresh or "trailer" not in it)]
    if need_trailer:
        log(f"· finding {len(need_trailer)} trailers…")
        with ThreadPoolExecutor(6) as ex:
            for it, (vid, backdrop) in zip(need_trailer, ex.map(find_trailer, need_trailer)):
                it["trailer"] = vid
                if backdrop and not (it.get("backdrop") or "").startswith("https://image.tmdb.org"):
                    it["backdrop"] = backdrop
                if not vid:
                    log(f"  ! no trailer found for {it['title']}")

    # 7 ─ Open Library covers + reader ratings (refreshed every run)
    books = [it for it in catalog.values() if it["type"] == "book"]
    log(f"· Open Library for {len(books)} books…")
    with ThreadPoolExecutor(6) as ex:
        for it, extra in zip(books, ex.map(open_library, books)):
            for k, v in extra.items():
                if k == "olid" and it.get("olid"):
                    continue
                it[k] = v

    # 8 ─ live IMDb ratings (optional)
    if OMDB_KEY:
        screen = [it for it in catalog.values() if it["type"] != "book" and it.get("imdbId")]
        log(f"· OMDb ratings for {len(screen)} titles…")
        with ThreadPoolExecutor(4) as ex:
            for it, r in zip(screen, ex.map(lambda i: omdb_rating(i["imdbId"]), screen)):
                if r:
                    it["imdb"] = r

    # 9 ─ popularity from page views
    for it in catalog.values():
        it["pop"] = pop_score(it.get("views30", 0))
        it.pop("yt", None) if it.get("source") == "auto" else None
        if it.get("newSeason") and it.get("released"):
            try:
                if (TODAY - dt.date.fromisoformat(it["released"])).days > 60:
                    it.pop("newSeason", None)
            except ValueError:
                pass

    labels.save()
    seed_order = {s["id"]: i for i, s in enumerate(seed)}
    items = sorted(catalog.values(), key=lambda it: (it.get("source") != "seed", seed_order.get(it["id"], 0),
                                                    "" if it.get("source") == "seed" else it.get("added", "")))
    OUT_PATH.write_text(json.dumps({
        "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "sources": {"tmdb": bool(TMDB_KEY), "omdb": bool(OMDB_KEY)},
        "items": items,
    }, ensure_ascii=False, indent=1), "utf-8")
    autos = sum(1 for it in items if it.get("source") == "auto")
    log(f"✓ wrote {OUT_PATH.relative_to(ROOT)}: {len(items)} titles ({autos} auto-added) in {time.time() - started:.0f}s")


if __name__ == "__main__":
    sys.exit(main())
