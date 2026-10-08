"""Remove bearer capabilities from diagnostic paths and access logs."""
import re

_CAPABILITY = re.compile(r"(/(?:api/live-trip|live|route/share|api/shared-route|family/invite|reset-password)/)[A-Za-z0-9_-]+")


def redact_path(value):
    return _CAPABILITY.sub(r"\1[redacted]", str(value)).split("?")[0]
