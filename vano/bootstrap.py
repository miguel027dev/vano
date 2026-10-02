"""Runtime bridge for the incrementally modularized VANO application.

Modules are loaded in dependency order. Each module receives the current application
namespace, and newly defined symbols are propagated back to modules loaded earlier.
This keeps existing function bodies working while the monolith is split without
introducing circular imports.
"""
from __future__ import annotations

import importlib

_CORE: dict[str, object] = {}
_MODULES: list[object] = []


def _copyable(name: str) -> bool:
    return not name.startswith("__")


def _snapshot(namespace: dict[str, object]) -> dict[str, object]:
    return {k: v for k, v in namespace.items() if _copyable(k)}


def inject(target: dict[str, object]) -> None:
    """Inject the application runtime namespace into a domain module."""
    target.update(_CORE)


def _sync_loaded_modules(core: dict[str, object]) -> None:
    """Fill late-bound dependencies in modules loaded earlier.

    Existing names owned by a module are preserved. Only symbols that were not
    available when that module was imported are filled in.
    """
    current = _snapshot(core)
    for module in _MODULES:
        module_globals = vars(module)
        for name, value in current.items():
            module_globals.setdefault(name, value)


def install(core: dict[str, object], module_name: str):
    """Load one domain module and expose its definitions to the app namespace."""
    _CORE.clear()
    _CORE.update(_snapshot(core))
    module = importlib.import_module(module_name)
    if module not in _MODULES:
        _MODULES.append(module)

    core.update(_snapshot(vars(module)))

    _CORE.clear()
    _CORE.update(_snapshot(core))
    _sync_loaded_modules(core)
    return module
