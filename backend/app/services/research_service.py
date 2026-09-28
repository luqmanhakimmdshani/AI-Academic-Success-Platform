"""Research Discovery: searches open-access literature APIs and produces a
themed literature review grounded only in retrieved abstracts (FR-1..FR-8)."""
import hashlib
import json

from app.services import llm_client
from app.services.cache import get_json, set_json
from app.services.external_apis import search_all_sources
from app.services.source_service import format_apa

CACHE_TTL_SECONDS = 60 * 60 * 24  # 1 day: repeat topics are common and abstracts don't change

SYSTEM_PROMPT = """You are a research assistant helping an undergraduate student build a literature review for an assignment. You will be given a list of open-access paper abstracts. Organize them into a themed literature review.

Hard rules:
1. Base every theme, finding, and gap ONLY on the abstracts provided. Do not invent papers, findings, or statistics not present in the abstracts.
2. If an abstract is empty or unhelpful, ignore it rather than fabricating content for it.
3. Identify genuine research gaps only if they are actually implied by contrasts/absences across the given abstracts -- do not pad with generic gaps.
4. Write for a student audience: clear, concise, no unexplained jargon."""


def _cache_key(topic: str, language: str) -> str:
    normalized = topic.strip().lower()
    digest = hashlib.sha256(f"{normalized}:{language}".encode()).hexdigest()
    return f"research_summary:{digest}"


def run_research_discovery(topic: str, language: str) -> dict:
    cache_key = _cache_key(topic, language)
    cached = get_json(cache_key)
    if cached:
        return cached

    raw_sources = search_all_sources(topic)
    usable_sources = [s for s in raw_sources if s.get("abstract")]

    if not usable_sources:
        result = {
            "themes": [],
            "key_findings": [],
            "research_gaps": [],
            "sources": [_to_source_out(s) for s in raw_sources],
            "note": "no_abstracts_available",
        }
        set_json(cache_key, result, CACHE_TTL_SECONDS)
        return result

    # Abstract length (not source count) dominates prompt size and CPU
    # inference time on a local 3B model -- truncating retains enough of
    # each abstract for theme classification while cutting tokens sharply.
    _ABSTRACT_CHAR_CAP = 500
    abstracts_block = "\n\n".join(
        f"[{i + 1}] {s['title']} ({s.get('year', 'n.d.')})\n{s['abstract'][:_ABSTRACT_CHAR_CAP]}"
        for i, s in enumerate(usable_sources)
    )
    user_prompt = f"""RESEARCH TOPIC: {topic}

ABSTRACTS:
{abstracts_block}

{llm_client.language_directive(language)}

Respond as JSON:
{{
  "themes": [{{"theme": "string", "summary": "string", "source_indices": [1,2]}}],
  "key_findings": [{{"finding": "string", "source_indices": [1]}}],
  "research_gaps": ["string", ...]
}}"""

    parsed = llm_client.complete_json(SYSTEM_PROMPT, user_prompt, max_tokens=1500)

    def attach_sources(items: list[dict]) -> list[dict]:
        for item in items:
            idxs = item.get("source_indices", [])
            item["sources"] = [_to_source_out(usable_sources[i - 1]) for i in idxs if 1 <= i <= len(usable_sources)]
        return items

    result = {
        "themes": attach_sources(parsed.get("themes", [])),
        "key_findings": attach_sources(parsed.get("key_findings", [])),
        "research_gaps": [_coerce_gap_to_string(g) for g in parsed.get("research_gaps", [])],
        "sources": [_to_source_out(s) for s in usable_sources],
    }
    set_json(cache_key, result, CACHE_TTL_SECONDS)
    return result


def _coerce_gap_to_string(gap) -> str:
    """The system prompt asks for research_gaps as a flat list of strings,
    but smaller/less instruction-following models (verified live with
    llama3.2:3b) sometimes pattern-match the adjacent themes/key_findings
    shape instead and return {"gap": "...", "source_indices": [...]} objects,
    which broke response validation with an unhandled 500. Normalize either
    shape defensively rather than trusting the model followed the schema.
    """
    if isinstance(gap, str):
        return gap
    if isinstance(gap, dict):
        for key in ("gap", "description", "text", "finding", "summary"):
            if isinstance(gap.get(key), str):
                return gap[key]
        return json.dumps(gap)
    return str(gap)


def _to_source_out(source: dict) -> dict:
    return {
        "title": source.get("title", ""),
        "authors": source.get("authors", ""),
        "year": source.get("year"),
        "doi": source.get("doi", ""),
        "url": source.get("url", ""),
        "venue": source.get("venue", ""),
        "formatted_apa": format_apa(source),
    }
