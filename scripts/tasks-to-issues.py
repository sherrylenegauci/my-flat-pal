#!/usr/bin/env python3
"""
Create one GitHub issue per task in tasks.md, closing those already done.

Run with --dry-run first. Issue creation is rate-limited by GitHub's secondary
limits on content creation, so this paces itself and can be resumed: it reads
the existing issue list and skips any task ID that already has one.
"""
import argparse
import json
import re
import subprocess
import sys
import time
from pathlib import Path

TASKS = Path("specs/001-maintenance-schedule/tasks.md")
TASK_LINE = re.compile(r"^- \[([ Xx])\] (T\d{3})\s+(.*)$")
PHASE_LINE = re.compile(r"^## (Phase .*)$")
MARKERS = re.compile(r"^(\[P\]\s*)?(\[US\d\]\s*)?")


def parse():
    tasks, phase = [], "Uncategorised"
    for raw in TASKS.read_text().splitlines():
        if m := PHASE_LINE.match(raw):
            phase = m.group(1)
            continue
        if m := TASK_LINE.match(raw):
            done, tid, rest = m.group(1).lower() == "x", m.group(2), m.group(3)
            story = sm.group(1) if (sm := re.search(r"\[(US\d)\]", rest)) else None
            desc = MARKERS.sub("", rest).strip()
            tasks.append(
                {"id": tid, "done": done, "desc": desc, "phase": phase, "story": story}
            )
    return tasks


def title_for(t):
    """`T001: description`, trimmed so it stays readable in a list view."""
    # Strip markdown emphasis and inline code so titles are plain text.
    plain = re.sub(r"[*`]", "", t["desc"])
    plain = re.sub(r"\s+", " ", plain).strip()
    if len(plain) > 90:
        plain = plain[:87].rstrip(" ,.;:") + "..."
    return f"{t['id']}: {plain}"


def body_for(t, done_note):
    parts = [
        t["desc"],
        "",
        "---",
        "",
        f"**Phase**: {t['phase']}",
    ]
    if t["story"]:
        parts.append(f"**User story**: {t['story']}")
    parts += [
        "",
        "Source: [`specs/001-maintenance-schedule/tasks.md`]"
        "(https://github.com/sherrylenegauci/my-flat-pal/blob/main/specs/001-maintenance-schedule/tasks.md)",
    ]
    if done_note:
        parts += ["", done_note]
    return "\n".join(parts)


def existing_issue_ids():
    """Task IDs that already have an issue, so re-runs do not duplicate."""
    out = subprocess.run(
        ["gh", "issue", "list", "--state", "all", "--limit", "500", "--json", "title"],
        capture_output=True, text=True, check=True,
    )
    ids = set()
    for issue in json.loads(out.stdout or "[]"):
        if m := re.search(r"\bT\d{3}\b", issue["title"]):
            ids.add(m.group(0))
    return ids


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--delay", type=float, default=1.2, help="seconds between API calls")
    args = ap.parse_args()

    tasks = parse()
    print(f"parsed {len(tasks)} tasks — {sum(t['done'] for t in tasks)} done, "
          f"{sum(not t['done'] for t in tasks)} open\n")

    if args.dry_run:
        for t in tasks[:4] + tasks[-3:]:
            print(f"  [{'X' if t['done'] else ' '}] {title_for(t)}")
            print(f"      phase={t['phase']!r} story={t['story']}")
        return 0

    already = existing_issue_ids()
    if already:
        print(f"{len(already)} task IDs already have issues; they will be skipped\n")

    created = closed = skipped = 0
    for t in tasks:
        if t["id"] in already:
            print(f"  {t['id']} already has an issue, skipping")
            skipped += 1
            continue

        note = (
            "Completed before this issue was filed — see the feature branch history."
            if t["done"] else ""
        )
        res = subprocess.run(
            ["gh", "issue", "create", "--title", title_for(t), "--body", body_for(t, note)],
            capture_output=True, text=True,
        )
        if res.returncode != 0:
            print(f"  {t['id']} FAILED: {res.stderr.strip()[:160]}", file=sys.stderr)
            continue

        url = res.stdout.strip().splitlines()[-1]
        created += 1
        time.sleep(args.delay)

        if t["done"]:
            num = url.rsplit("/", 1)[-1]
            c = subprocess.run(
                ["gh", "issue", "close", num, "--reason", "completed",
                 "--comment", "Done — implemented and committed on the feature branch."],
                capture_output=True, text=True,
            )
            if c.returncode == 0:
                closed += 1
                print(f"  {t['id']} created and closed  {url}")
            else:
                print(f"  {t['id']} created, CLOSE FAILED  {url}", file=sys.stderr)
            time.sleep(args.delay)
        else:
            print(f"  {t['id']} created  {url}")

    print(f"\ncreated {created}, closed {closed}, skipped {skipped}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
