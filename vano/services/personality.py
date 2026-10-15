"""Interpretador determinístico de preferências de rota.

Não usa LLM, não inventa indicadores de segurança, nem altera os algoritmos
de geração de trajetos. Mapeia apenas intenções explicitamente reconhecidas
para parâmetros já suportados pelo VANO.
"""
from __future__ import annotations

import re
import unicodedata


def _normal(text):
    return unicodedata.normalize("NFKD", text.lower()).encode("ascii", "ignore").decode()


def _wanted_avoid(text, noun):
    """Avoid detecting e.g. 'nao quero evitar pedagios' as an exclusion."""
    clause = next((part for part in re.split(r"[.;!\n]+", text) if re.search(noun, part)), "")
    if not clause:
        return False
    if re.search(r"\b(?:nao|nunca)\s+(?:quero|preciso|gosto de)\s+evitar\b", clause):
        return False
    return bool(re.search(r"\b(?:evit\w*|fug\w*|sem|dispens\w*|nao\s+(?:quero|gosto|uso|passo)\s+(?:por|em|de)?)\b", clause))


def interpret_preference_text(value):
    if not isinstance(value, str):
        value = ""
    text = value.strip()
    if len(text) > 500:
        raise ValueError("A descrição deve ter no máximo 500 caracteres.")
    n = _normal(text)
    fastest = bool(re.search(r"\b(?:rapido|rapidez|menor tempo|economiz\w* tempo|chegar logo)\b", n))
    relaxed = bool(re.search(r"\b(?:tranquil\w*|calm\w*|sossegad\w*|sem estresse|equilibr\w*)\b", n))
    cautious = bool(re.search(r"\b(?:segur\w*|menor risco|prioriz\w* seguranca)\b", n))
    mode = "balanced"
    if fastest and not relaxed and not cautious:
        mode = "fast_first"
    elif cautious and not fastest:
        mode = "safety_first"
    avoid_tolls = _wanted_avoid(n, r"pedagi\w*|toll\w*")
    avoid_unpaved = _wanted_avoid(n, r"terra|sem asfalto|nao pavimentad\w*|estrada de chao")
    avoid_ferries = _wanted_avoid(n, r"balsa\w*|ferry\w*")
    understood = []
    if fastest:
        understood.append("Prefere menor tempo de viagem")
    if relaxed:
        understood.append("Busca equilíbrio e tranquilidade")
    if cautious:
        understood.append("Dá importância aos riscos do trajeto")
    if avoid_tolls:
        understood.append("Evitar pedágios quando possível")
    if avoid_unpaved:
        understood.append("Evitar vias não pavimentadas quando possível")
    if avoid_ferries:
        understood.append("Evitar balsas quando possível")
    # Interest in crowded roads cannot be translated into a hard restriction.
    unsupported = []
    if re.search(r"movimentad\w*|avenidas? principais?|ruas? vazias?|ruas? iluminad\w*", n):
        unsupported.append("Preferência por tipo de via: ainda sem dados suficientes")
    return {
        "text": text,
        "route_preference": mode,
        "avoid_tolls": avoid_tolls,
        "avoid_unpaved": avoid_unpaved,
        "avoid_ferries": avoid_ferries,
        "understood": understood,
        "requires_more_data": unsupported,
        "needs_review": bool(text and not understood),
    }
