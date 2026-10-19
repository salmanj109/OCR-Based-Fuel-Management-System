"""Reuse the original PDF, truck, and trip code without copying it.

The original modules live at the repository root and are also used by the
preserved Streamlit application. Their database connection functions are
adapted to the backend's configured SQLAlchemy pool.
"""

import importlib.util
import os
from functools import lru_cache
from pathlib import Path
from types import ModuleType

from app.core.database import get_engine


PROJECT_ROOT = Path(__file__).resolve().parents[3]


def _load_file(name: str) -> ModuleType:
    path = PROJECT_ROOT / f"{name}.py"
    spec = importlib.util.spec_from_file_location(f"ocr_legacy_{name}", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load legacy module {name}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.get_db_connection = lambda: get_engine().raw_connection()
    return module


@lru_cache(maxsize=1)
def _modules() -> tuple[ModuleType, ModuleType, ModuleType]:
    return _load_file("app"), _load_file("app_1"), _load_file("app_2")


def get_legacy() -> tuple[ModuleType, ModuleType, ModuleType]:
    pdf, trucks, trips = _modules()
    # The original routing module reads API_KEY at import time. Refresh it so
    # environment changes made before a server restart are honoured.
    trips.API_KEY = os.getenv("API_KEY")
    return pdf, trucks, trips
