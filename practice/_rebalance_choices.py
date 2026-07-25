#!/usr/bin/env python3
"""Rebalance choice lengths and A–D distribution (see skill refresh-pert-reading-bank).

Prefer re-assembling from _gen_batch_*.py first if choices were corrupted, then run
length/letter balancing carefully so the keyed answer is not a length tell.
"""

from __future__ import annotations

import json
import random
import re
from collections import Counter
from pathlib import Path

BANK = Path(__file__).resolve().parent / "questions.json"

SENT_EXT = [
    "Other details in the text are treated as secondary.",
    "The author offers little room for a competing view.",
    "That reading leaves aside the limits noted nearby.",
    "Competing explanations in the text are set aside.",
    "The writer treats the idea as settled rather than tentative.",
    "Nearby examples are taken to confirm it completely.",
]


def ens(s: str) -> str:
    s = re.sub(r"\s+", " ", s.strip())
    return s if s.endswith((".", "?", "!")) else s + "."


def expand_to(text: str, target: int, rng: random.Random) -> str:
    t = re.sub(r"\s+", " ", text.strip())
    if len(t) >= int(target * 0.88):
        return t
    if t[:1].isupper() and len(t.split()) >= 6:
        base = ens(t)
        exts = SENT_EXT[:]
        rng.shuffle(exts)
        for e in exts:
            cand = f"{base} {e}"
            if int(target * 0.88) <= len(cand) <= target + 40:
                return cand
            if len(cand) < int(target * 0.88):
                base = cand
        return base
    # short phrase / title
    pads = [
        "in every situation described",
        "rather than any limited case",
        "as the full and final reading",
        "with no meaningful exception",
        "as the controlling idea overall",
    ]
    rng.shuffle(pads)
    out = t.rstrip(".")
    for p in pads:
        cand = f"{out} {p}"
        if int(target * 0.88) <= len(cand) <= target + 30:
            return cand
        if len(cand) < target + 30:
            out = cand
    return out


def trim_to(text: str, limit: int, prefer_period: bool) -> str:
    t = text.strip()
    if len(t) <= limit:
        return t
    if ". " in t:
        sents = re.split(r"(?<=[.!?])\s+", t)
        acc = sents[0]
        for s in sents[1:]:
            if len(acc) + 1 + len(s) <= limit:
                acc = f"{acc} {s}"
            else:
                break
        t = ens(acc) if prefer_period else acc
    if len(t) > limit:
        t = t[:limit].rsplit(" ", 1)[0]
        if prefer_period:
            t = ens(t)
    return t


def main() -> None:
    data = json.loads(BANK.read_text(encoding="utf-8"))
    rng = random.Random(99)

    for q in data["questions"]:
        ci = q["correct"]
        choices = list(q["choices"])
        correct = choices[ci]
        target = len(correct)
        new = []
        for i, c in enumerate(choices):
            if i == ci:
                new.append(correct)
            else:
                t = expand_to(c, target, rng)
                t = trim_to(t, target + 12, prefer_period=correct.endswith("."))
                new.append(t)
        q["choices"] = new

    n = len(data["questions"])
    per = n // 4
    targets = [0] * per + [1] * per + [2] * per + [3] * (n - 3 * per)
    rng.shuffle(targets)
    for q, tgt in zip(sorted(data["questions"], key=lambda x: x["id"]), targets):
        ci = q["correct"]
        if ci != tgt:
            q["choices"][ci], q["choices"][tgt] = q["choices"][tgt], q["choices"][ci]
            q["correct"] = tgt

    data["version"] = int(data.get("version", 1)) + 1
    BANK.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    qs = data["questions"]
    print("version", data["version"])
    print("correct dist", dict(sorted(Counter(q["correct"] for q in qs).items())))
    diffs = []
    for thr in (15, 20):
        long = short = 0
        for q in qs:
            lens = [len(c) for c in q["choices"]]
            c = q["correct"]
            cl = lens[c]
            others = [lens[i] for i in range(4) if i != c]
            if thr == 15:
                diffs.append(cl - sum(others) / 3)
            if cl >= max(others) + thr:
                long += 1
            if cl <= min(others) - thr:
                short += 1
        print(f"±{thr}ch longest {long} shortest {short}")
    print(f"avg diff {sum(diffs)/len(diffs):.1f}")


if __name__ == "__main__":
    main()
