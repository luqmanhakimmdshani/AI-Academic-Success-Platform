"""Clients for the open-access literature APIs used by Research Discovery
and the Source Organiser (PRD §7.1, §7.4, §11).

Google Scholar has no free official API, so per the PRD's documented
substitution (§14) this platform indexes Semantic Scholar + DOAJ +
OpenAlex instead. Each function fails soft (returns []) on error so one
slow/down provider never fails the whole search (NFR-8).
"""
import re
from concurrent.futures import ThreadPoolExecutor

import httpx

from app.config import settings

_TIMEOUT = 10.0


def search_semantic_scholar(topic: str, limit: int = 10) -> list[dict]:
    try:
        headers = {"x-api-key": settings.semantic_scholar_api_key} if settings.semantic_scholar_api_key else {}
        resp = httpx.get(
            "https://api.semanticscholar.org/graph/v1/paper/search",
            params={
                "query": topic,
                "limit": limit,
                "fields": "title,abstract,year,authors,externalIds,venue,url,isOpenAccess",
            },
            headers=headers,
            timeout=_TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json().get("data", [])
        results = []
        for p in data:
            if not p.get("isOpenAccess", True):
                continue
            results.append(
                {
                    "title": p.get("title") or "",
                    "abstract": p.get("abstract") or "",
                    "year": p.get("year"),
                    "authors": ", ".join(a.get("name", "") for a in p.get("authors", [])),
                    "doi": (p.get("externalIds") or {}).get("DOI", ""),
                    "url": p.get("url") or "",
                    "venue": p.get("venue") or "",
                    "source_api": "semantic_scholar",
                    "peer_reviewed_hint": bool(p.get("venue")),
                }
            )
        return results
    except Exception:
        return []


def search_doaj(topic: str, limit: int = 10) -> list[dict]:
    try:
        resp = httpx.get(
            f"https://doaj.org/api/search/articles/{httpx.QueryParams({'q': topic})['q']}",
            params={"pageSize": limit},
            timeout=_TIMEOUT,
        )
        resp.raise_for_status()
        results = []
        for item in resp.json().get("results", []):
            bib = item.get("bibjson", {})
            authors = ", ".join(a.get("name", "") for a in bib.get("author", []))
            doi = next((i.get("id", "") for i in bib.get("identifier", []) if i.get("type") == "doi"), "")
            link = next((lnk.get("url", "") for lnk in bib.get("link", [])), "")
            results.append(
                {
                    "title": bib.get("title", ""),
                    "abstract": bib.get("abstract", ""),
                    "year": int(bib.get("year")) if str(bib.get("year", "")).isdigit() else None,
                    "authors": authors,
                    "doi": doi,
                    "url": link,
                    "venue": bib.get("journal", {}).get("title", ""),
                    "source_api": "doaj",
                    "peer_reviewed_hint": True,  # DOAJ only indexes peer-reviewed OA journals
                }
            )
        return results
    except Exception:
        return []


def search_openalex(topic: str, limit: int = 10) -> list[dict]:
    try:
        resp = httpx.get(
            "https://api.openalex.org/works",
            params={"search": topic, "per_page": limit, "filter": "is_oa:true"},
            timeout=_TIMEOUT,
        )
        resp.raise_for_status()
        results = []
        for w in resp.json().get("results", []):
            authors = ", ".join(
                a.get("author", {}).get("display_name", "") for a in w.get("authorships", [])
            )
            venue = (w.get("primary_location") or {}).get("source") or {}
            results.append(
                {
                    "title": w.get("title") or w.get("display_name") or "",
                    "abstract": _reconstruct_abstract(w.get("abstract_inverted_index")),
                    "year": w.get("publication_year"),
                    "authors": authors,
                    "doi": (w.get("doi") or "").replace("https://doi.org/", ""),
                    "url": (w.get("primary_location") or {}).get("landing_page_url", ""),
                    "venue": venue.get("display_name", ""),
                    "source_api": "openalex",
                    "peer_reviewed_hint": venue.get("type") == "journal",
                }
            )
        return results
    except Exception:
        return []


def _reconstruct_abstract(inverted_index: dict | None) -> str:
    if not inverted_index:
        return ""
    positions: dict[int, str] = {}
    for word, idxs in inverted_index.items():
        for i in idxs:
            positions[i] = word
    return " ".join(positions[i] for i in sorted(positions))


def search_all_sources(topic: str, limit_per_source: int = 6) -> list[dict]:
    # The three providers are independent network calls -- run them
    # concurrently rather than one after another (each has its own 10s
    # timeout, so sequential was up to 3x slower in the worst case).
    with ThreadPoolExecutor(max_workers=3) as executor:
        futures = [
            executor.submit(search_semantic_scholar, topic, limit_per_source),
            executor.submit(search_doaj, topic, limit_per_source),
            executor.submit(search_openalex, topic, limit_per_source),
        ]
        combined = [item for future in futures for item in future.result()]
    return _dedupe(combined)


def _dedupe(results: list[dict]) -> list[dict]:
    seen_dois: set[str] = set()
    seen_titles: set[str] = set()
    deduped = []
    for r in results:
        doi = (r.get("doi") or "").lower().strip()
        title_key = "".join(ch.lower() for ch in (r.get("title") or "") if ch.isalnum())
        if doi and doi in seen_dois:
            continue
        if title_key and title_key in seen_titles:
            continue
        if doi:
            seen_dois.add(doi)
        if title_key:
            seen_titles.add(title_key)
        deduped.append(r)
    return deduped


_DOI_URL_RE = re.compile(r"doi\.org/(10\.\d{4,9}/\S+)", re.IGNORECASE)
_ARXIV_URL_RE = re.compile(r"arxiv\.org/(?:abs|pdf)/(\d{4}\.\d{4,5})", re.IGNORECASE)


def resolve_doi(doi: str) -> dict | None:
    """Direct DOI lookup -- must be tried before any fuzzy text search, since
    searching on a DOI/URL string as free text can match an unrelated paper
    that merely shares a stray keyword (verified during testing: this was
    silently returning wrong papers when a DOI URL was full-text-searched).
    """
    try:
        resp = httpx.get(f"https://api.openalex.org/works/https://doi.org/{doi}", timeout=_TIMEOUT)
        if resp.status_code != 200:
            return None
        w = resp.json()
        authors = ", ".join(a.get("author", {}).get("display_name", "") for a in w.get("authorships", []))
        venue = (w.get("primary_location") or {}).get("source") or {}
        return {
            "title": w.get("title") or w.get("display_name") or "",
            "abstract": _reconstruct_abstract(w.get("abstract_inverted_index")),
            "year": w.get("publication_year"),
            "authors": authors,
            "doi": doi,
            "url": (w.get("primary_location") or {}).get("landing_page_url", f"https://doi.org/{doi}"),
            "venue": venue.get("display_name", ""),
            "source_api": "openalex",
            "peer_reviewed_hint": venue.get("type") == "journal",
        }
    except Exception:
        return None


def resolve_single_entry(entry: str) -> dict | None:
    """Resolve one URL or title string to a canonical source record for the Source Organiser."""
    entry = entry.strip()
    if not entry:
        return None

    if entry.lower().startswith("http"):
        doi_match = _DOI_URL_RE.search(entry)
        if doi_match:
            resolved = resolve_doi(doi_match.group(1))
            if resolved:
                return resolved
        arxiv_match = _ARXIV_URL_RE.search(entry)
        if arxiv_match:
            resolved = resolve_doi(f"10.48550/arXiv.{arxiv_match.group(1)}")
            if resolved:
                return resolved
        # Non-DOI, non-arXiv URL, or lookup failed: fall back to a fuzzy metadata guess
        # rather than a full-text search (searching raw URL text as a query
        # tends to match an unrelated paper on a stray shared keyword).
        return {
            "title": entry,
            "abstract": "",
            "year": None,
            "authors": "",
            "doi": "",
            "url": entry,
            "venue": "",
            "source_api": "unresolved_url",
            "peer_reviewed_hint": False,
        }

    for search_fn in (search_semantic_scholar, search_openalex, search_doaj):
        results = search_fn(entry, limit=1)
        if results:
            return results[0]
    return None
