"""Attach CSP nonces to trusted Jinja template source, not rendered user content.

This runs before template rendering. A post-render HTML replacement would also
authorize script tags accidentally injected through an XSS vulnerability.
"""
import re

from jinja2.ext import Extension


_TAG_RE = re.compile(r"</?(?:script|style)\b[^>]*>", re.IGNORECASE | re.DOTALL)
_NONCE_RE = re.compile(r"\snonce\s*=", re.IGNORECASE)


class TrustedInlineNonceExtension(Extension):
    """Preprocess trusted template files before Jinja interpolates any values."""

    def preprocess(self, source, name, filename=None):
        inside_raw_element = False

        def attach_nonce(match):
            nonlocal inside_raw_element
            tag = match.group(0)
            if tag.startswith("</"):
                inside_raw_element = False
                return tag
            # Script/style bodies are raw text, potentially containing strings
            # that resemble tags. Never rewrite those.
            if inside_raw_element:
                return tag
            inside_raw_element = True
            if _NONCE_RE.search(tag):
                return tag
            # The nonce is evaluated at render time for each request, so the
            # compiled template can safely remain cached between requests.
            return tag[:-1] + ' nonce="{{ g.csp_nonce }}">'

        return _TAG_RE.sub(attach_nonce, source)
