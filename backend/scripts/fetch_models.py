"""Fetch trained .pth weights from a Hugging Face Hub repo at startup.

Optional: only runs if HF_MODEL_REPO is set. Any weight that is missing is
skipped, and the corresponding module transparently falls back to its mock —
so the demo always works end-to-end.

Usage (called from Dockerfile CMD or manually):
    python -m scripts.fetch_models
"""
from __future__ import annotations

import os
from pathlib import Path

MODELS_DIR = Path(__file__).resolve().parents[1] / "app" / "models"
WEIGHT_FILES = [
    "smartpack_gnn_ppo.pth",
    "greensched_lstm.pth",
    "sentinelai_tcn.pth",
    "costcut_lstm.pth",
]


def main() -> None:
    repo = os.getenv("HF_MODEL_REPO", "").strip()
    if not repo:
        print("[fetch_models] HF_MODEL_REPO not set — skipping (mocks will be used).")
        return

    try:
        from huggingface_hub import hf_hub_download
    except ImportError:
        print("[fetch_models] huggingface_hub not installed — skipping.")
        return

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    token = os.getenv("HF_TOKEN") or None
    for fname in WEIGHT_FILES:
        try:
            path = hf_hub_download(repo_id=repo, filename=fname, token=token)
            dest = MODELS_DIR / fname
            dest.write_bytes(Path(path).read_bytes())
            print(f"[fetch_models] downloaded {fname}")
        except Exception as e:  # missing file -> mock fallback
            print(f"[fetch_models] {fname} not available ({e}); using mock.")


if __name__ == "__main__":
    main()
