"""Small startup bridge used while VANO is split into domain modules."""
from __future__ import annotations

import importlib

_CORE: dict[str, object] = {}


def _copyable(name: str) -> bool:
    return not name.startswith("__")


def inject(target: dict[str, object]) -> None:
    """Inject the application runtime namespace into a domain module."""
    target.update({k: v for k, v in _CORE.items() if _copyable(k)})


def install(core: dict[str, object], module_name: str):
    """Load one domain module and expose its definitions to later modules."""
    _CORE.clear()
    _CORE.update({k: v for k, v in core.items() if _copyable(k)})
    module = importlib.import_module(module_name)
    core.update({k: v for k, v in vars(module).items() if _copyable(k)})
    return module
