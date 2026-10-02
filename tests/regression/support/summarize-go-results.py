"""Summarize actual Go test events, including skips; do not infer test coverage."""
import collections
import json
import sys

counts = collections.Counter()
skipped = []
with open(sys.argv[1], encoding="utf-8") as events:
    for line in events:
        event = json.loads(line)
        if event.get("Test") and event.get("Action") in {"pass", "fail", "skip"}:
            counts[event["Action"]] += 1
            if event["Action"] == "skip":
                skipped.append(f"{event['Package']}/{event['Test']}")
print(f"Go tests: {counts['pass']} passed, {counts['fail']} failed, {counts['skip']} skipped")
for name in skipped:
    print(f"SKIPPED: {name}")
