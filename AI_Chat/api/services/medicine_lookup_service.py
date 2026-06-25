"""Search medicine KB and medicine catalog, then build AI context."""
import logging
import re
from typing import Any, Dict, List, Tuple

from config import diseases, medicine_catalog

logger = logging.getLogger(__name__)

_MEDICINE_QUERY_HINTS = (
    'medicine', 'medication', 'drug', 'prescrib', 'treatment', 'therapy',
    'dosage', 'dose', 'condition', 'disease', 'symptom', 'diagnos',
    'manage', 'protocol', 'first-line', 'recommend', 'suggest',
)

_STOP_WORDS = frozenset({
    'a', 'an', 'the', 'is', 'are', 'was', 'were', 'for', 'and', 'or', 'to',
    'of', 'in', 'on', 'with', 'what', 'how', 'can', 'should', 'patient',
    'help', 'me', 'about', 'common', 'best', 'latest', 'protocols',
})


def _normalize(text: str) -> str:
    return re.sub(r'\s+', ' ', (text or '').lower()).strip()


def _tokens(text: str) -> List[str]:
    return [
        t for t in re.findall(r'[a-z0-9]+', _normalize(text))
        if len(t) > 2 and t not in _STOP_WORDS
    ]


def _should_include_lookup(user_message: str) -> bool:
    msg = _normalize(user_message)
    if any(h in msg for h in _MEDICINE_QUERY_HINTS):
        return True
    # Short condition-style queries ("gout", "type 2 diabetes")
    return len(_tokens(user_message)) <= 6


def _score_entry(entry: Dict[str, Any], query: str, query_tokens: List[str]) -> float:
    disease = entry.get('Disease') or ''
    description = entry.get('Description') or ''
    symptoms = entry.get('Symptoms') or []
    treatments = entry.get('Common Treatments') or []
    causes = entry.get('Causes') or []

    score = 0.0
    disease_lower = _normalize(disease)
    query_lower = _normalize(query)

    if disease_lower and disease_lower in query_lower:
        score += 20
    elif disease_lower:
        disease_tokens = set(_tokens(disease))
        overlap = disease_tokens & set(query_tokens)
        score += len(overlap) * 4

    for symptom in symptoms:
        s = _normalize(symptom)
        if s in query_lower:
            score += 5
        else:
            score += len(set(_tokens(symptom)) & set(query_tokens)) * 2

    for treatment in treatments:
        t = _normalize(treatment)
        if any(tok in t for tok in query_tokens):
            score += 3

    for cause in causes:
        if _normalize(cause) in query_lower:
            score += 2

    desc_tokens = set(_tokens(description))
    score += len(desc_tokens & set(query_tokens)) * 0.5

    return score


def _safe_text(value: Any) -> str:
    return (value or '') if isinstance(value, str) else str(value or '')


def _normalize_catalog_component(component: str) -> str:
    """
    Normalize one molecule component to improve duplicate detection.
    Example: "DOMPERIDONE IP10 MG" -> "domperidone ip 10 mg"
    """
    c = _normalize(component)
    # separate alpha+digit boundaries and collapse spacing/punctuation noise
    c = re.sub(r'([a-z])(\d)', r'\1 \2', c)
    c = re.sub(r'(\d)([a-z])', r'\1 \2', c)
    c = re.sub(r'[^a-z0-9.%/]+', ' ', c)
    return re.sub(r'\s+', ' ', c).strip()


def _catalog_dedupe_key(entry: Dict[str, Any]) -> str:
    """
    Build a stable key so rows with the same molecule composition in different order
    are treated as duplicates in search results.
    """
    medicine = _normalize(_safe_text(entry.get('Medicine')))
    molecule = _safe_text(entry.get('Molecule'))
    strength = _normalize(_safe_text(entry.get('Strength')))
    form = _normalize(_safe_text(entry.get('Form')))

    components = [
        _normalize_catalog_component(part)
        for part in re.split(r'\s*\+\s*', molecule)
        if _normalize_catalog_component(part)
    ]
    components.sort()
    molecule_sig = ' + '.join(components)

    return f"{medicine}|{molecule_sig}|{strength}|{form}"


def _score_catalog_entry(entry: Dict[str, Any], query: str, query_tokens: List[str]) -> float:
    medicine = _safe_text(entry.get('Medicine'))
    molecule = _safe_text(entry.get('Molecule'))
    indications = _safe_text(entry.get('Indications'))
    company = _safe_text(entry.get('Company'))
    form = _safe_text(entry.get('Form'))
    strength = _safe_text(entry.get('Strength'))

    query_lower = _normalize(query)
    score = 0.0

    if medicine and _normalize(medicine) in query_lower:
        score += 12
    if molecule and _normalize(molecule) in query_lower:
        score += 16
    if indications and _normalize(indications) in query_lower:
        score += 8

    for field, weight in (
        (medicine, 4),
        (molecule, 6),
        (indications, 3),
        (company, 2),
        (form, 1.5),
        (strength, 1.5),
    ):
        tokens = set(_tokens(field))
        overlap = tokens & set(query_tokens)
        score += len(overlap) * weight

    return score


def search_medicine_kbase(user_message: str, limit: int = 5) -> List[Tuple[float, Dict[str, Any]]]:
    if not diseases or not isinstance(diseases, list):
        return []

    query_tokens = _tokens(user_message)
    if not query_tokens and not _should_include_lookup(user_message):
        return []

    scored: List[Tuple[float, Dict[str, Any]]] = []
    for entry in diseases:
        if not isinstance(entry, dict):
            continue
        s = _score_entry(entry, user_message, query_tokens)
        if s >= 3:
            scored.append((s, entry))

    scored.sort(key=lambda x: (-x[0], (x[1].get('Disease') or '')))
    return scored[:limit]


def search_medicine_catalog(user_message: str, limit: int = 5) -> List[Tuple[float, Dict[str, Any]]]:
    if not medicine_catalog or not isinstance(medicine_catalog, list):
        return []

    query_tokens = _tokens(user_message)
    if not query_tokens and not _should_include_lookup(user_message):
        return []

    scored: List[Tuple[float, Dict[str, Any]]] = []
    for entry in medicine_catalog:
        if not isinstance(entry, dict):
            continue
        s = _score_catalog_entry(entry, user_message, query_tokens)
        if s >= 3:
            scored.append((s, entry))

    scored.sort(
        key=lambda x: (
            -x[0],
            _safe_text(x[1].get('Medicine')) or _safe_text(x[1].get('Molecule')),
        )
    )

    # De-duplicate near-identical molecule combinations (order/spacing variants).
    deduped: List[Tuple[float, Dict[str, Any]]] = []
    seen_keys = set()
    for score, entry in scored:
        key = _catalog_dedupe_key(entry)
        if key in seen_keys:
            continue
        seen_keys.add(key)
        deduped.append((score, entry))
        if len(deduped) >= limit:
            break

    return deduped


def format_medicine_kbase_context(matches: List[Tuple[float, Dict[str, Any]]]) -> str:
    if not matches:
        return ''

    lines = [
        'The following entries are from the institutional Medicine & Condition Lookup database (medicine_kbase.json).',
        'When suggesting treatments or medications, PRIORITIZE these listed common treatments and name them explicitly.',
        '',
    ]

    for idx, (_, entry) in enumerate(matches, 1):
        disease = entry.get('Disease') or 'Unknown condition'
        lines.append(f'{idx}. {disease}')
        if entry.get('Description'):
            lines.append(f'   Summary: {entry["Description"]}')
        symptoms = entry.get('Symptoms') or []
        if symptoms:
            lines.append(f'   Key symptoms: {"; ".join(symptoms[:5])}')
        treatments = entry.get('Common Treatments') or []
        if treatments:
            lines.append('   Common treatments (use in recommendations):')
            for t in treatments:
                lines.append(f'   - {t}')
        lines.append('')

    return '\n'.join(lines).strip()


def format_medicine_catalog_context(matches: List[Tuple[float, Dict[str, Any]]]) -> str:
    if not matches:
        return ''

    lines = [
        'The following entries are from the institutional Medicine Catalog (medicine_catalog.json).',
        'When answering medicine/molecule questions, prioritize these molecule compositions and map them to likely use-cases carefully.',
        '',
    ]

    for idx, (_, entry) in enumerate(matches, 1):
        medicine = _safe_text(entry.get('Medicine'))
        molecule = _safe_text(entry.get('Molecule'))
        strength = _safe_text(entry.get('Strength'))
        form = _safe_text(entry.get('Form'))
        company = _safe_text(entry.get('Company'))
        indications = _safe_text(entry.get('Indications'))

        lines.append(f'{idx}. {medicine or molecule or "Unnamed catalog entry"}')
        if molecule:
            lines.append(f'   Molecule(s): {molecule}')
        if strength:
            lines.append(f'   Strength: {strength}')
        if form:
            lines.append(f'   Form: {form}')
        if company:
            lines.append(f'   Company: {company}')
        if indications:
            lines.append(f'   Indications: {indications}')
        lines.append('')

    return '\n'.join(lines).strip()


def get_medicine_lookup_context(user_message: str, max_entries: int = 5) -> str:
    """Return formatted lookup context for general-mode AI prompts, or empty string."""
    if not _should_include_lookup(user_message):
        return ''

    try:
        kbase_matches = search_medicine_kbase(user_message, limit=max_entries)
        catalog_matches = search_medicine_catalog(user_message, limit=max_entries)
        if not kbase_matches and not catalog_matches:
            return ''
        parts: List[str] = []
        if kbase_matches:
            parts.append(format_medicine_kbase_context(kbase_matches))
        if catalog_matches:
            parts.append(format_medicine_catalog_context(catalog_matches))
        context = '\n\n'.join([p for p in parts if p])
        logger.info(
            'Medicine lookup matched %s kbase and %s catalog entries for query: %s',
            len(kbase_matches),
            len(catalog_matches),
            (user_message or '')[:80],
        )
        return context
    except Exception as exc:
        logger.warning('Medicine lookup failed: %s', exc)
        return ''
