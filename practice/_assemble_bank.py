#!/usr/bin/env python3
"""Assemble batch generators into questions.json and validate."""

from __future__ import annotations

import importlib.util
import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SKILLS = [
    {"id": "main-idea", "name": "Main idea & summary"},
    {"id": "evidence", "name": "Evidence & assertions"},
    {"id": "vocab-context", "name": "Vocabulary in context"},
    {"id": "tone-structure", "name": "Tone & structure"},
    {"id": "purpose", "name": "Author's purpose"},
    {"id": "relationships", "name": "Sentence relationships"},
    {"id": "character", "name": "Character & motivation"},
    {"id": "compare", "name": "Comparing texts"},
    {"id": "fact-opinion", "name": "Fact vs. opinion"},
    {"id": "rhetoric", "name": "Reasoning & rhetoric"},
]
PREFIX = {
    "main-idea": "mi-",
    "evidence": "ev-",
    "vocab-context": "vc-",
    "tone-structure": "ts-",
    "purpose": "pu-",
    "relationships": "re-",
    "character": "ch-",
    "compare": "co-",
    "fact-opinion": "fo-",
    "rhetoric": "rh-",
}


def load_batch(name: str):
    path = ROOT / name
    if not path.is_file():
        raise FileNotFoundError(path)
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(mod)
    return list(mod.QUESTIONS)


def main() -> None:
    batches = ["_gen_batch_a.py", "_gen_batch_b.py", "_gen_batch_c.py", "_gen_batch_d.py"]
    questions = []
    for b in batches:
        part = load_batch(b)
        print(f"loaded {b}: {len(part)}")
        questions.extend(part)

    ids = [q["id"] for q in questions]
    if len(ids) != len(set(ids)):
        dupes = [i for i, n in Counter(ids).items() if n > 1]
        raise SystemExit(f"duplicate ids: {dupes[:20]}")

    if len(questions) != 400:
        raise SystemExit(f"expected 400 questions, got {len(questions)}")

    # Sort by skill order then id number
    skill_order = {s["id"]: i for i, s in enumerate(SKILLS)}

    def sort_key(q):
        num = int(q["id"].split("-")[1])
        return (skill_order[q["skill"]], num)

    questions = sorted(questions, key=sort_key)

    words = [len(q["passage"].split()) for q in questions]
    short = [q["id"] for q, w in zip(questions, words) if w < 100]
    if short:
        print(f"WARNING: {len(short)} passages under 100 words: {short[:15]}...")

    counts = Counter(q["skill"] for q in questions)
    for sid in skill_order:
        if counts[sid] != 40:
            raise SystemExit(f"{sid}: expected 40, got {counts[sid]}")
        for q in questions:
            if q["skill"] != sid:
                continue
            if not q["id"].startswith(PREFIX[sid]):
                raise SystemExit(f"bad prefix {q['id']} for {sid}")

    out = {
        "version": 3,
        "title": "PERT Reading Practice",
        "skills": SKILLS,
        "questions": questions,
    }
    dest = ROOT / "questions.json"
    dest.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {dest}")
    print(f"questions: {len(questions)}")
    print(f"passage words: min={min(words)} median={sorted(words)[len(words)//2]} max={max(words)} avg={sum(words)/len(words):.1f}")
    for sid, n in counts.items():
        print(f"  {sid}: {n}")


if __name__ == "__main__":
    try:
        main()
    except FileNotFoundError as e:
        print(f"waiting for batch file: {e}", file=sys.stderr)
        sys.exit(2)
