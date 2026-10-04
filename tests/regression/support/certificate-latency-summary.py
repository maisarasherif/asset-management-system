"""Summarize measured successful certificate requests without recording tokens or URLs."""
import argparse
from collections import defaultdict
import json
import math
from pathlib import Path
import re

OPERATION_CODES = ("generated-preview", "generated-issuance", "external-renewal", "retry")
OPERATIONS = set(OPERATION_CODES)
PREFIX = "[CERTIFICATE_TIMING] "


def summarize(samples):
    groups = defaultdict(list)
    excluded = 0
    for sample in samples:
        operation = sample.get("operation")
        duration = sample.get("duration_ms")
        published = operation == "generated-preview" or sample.get("state") == "COMPLETED"
        if (operation not in OPERATIONS or sample.get("status") != 200 or not published
                or sample.get("controlled_fault") is not False
                or isinstance(duration, bool) or not isinstance(duration, (float, int))
                or not math.isfinite(duration) or duration < 0):
            excluded += 1
            continue
        groups[(sample["layer"], operation)].append(duration)
    rows = []
    for (layer, operation), durations in sorted(groups.items()):
        values = sorted(durations)
        percentile = lambda fraction: values[max(0, math.ceil(len(values) * fraction) - 1)]
        rows.append({"layer": layer, "operation": operation, "count": len(values),
                     "min_ms": values[0], "p50_ms": percentile(.50),
                     "p95_ms": percentile(.95), "max_ms": values[-1]})
    return {"percentile_method": "nearest rank", "excluded_samples": excluded,
            "measurements": rows, "missing_operations": sorted(OPERATIONS - {row["operation"] for row in rows}),
            "note": "Observed HTTP durations, not a load benchmark or latency acceptance threshold."}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--newman-log", type=Path, required=True)
    parser.add_argument("--playwright-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    samples = []
    if args.newman_log.exists():
        for line in args.newman_log.read_text(encoding="utf-8", errors="replace").splitlines():
            line = re.sub(r"\x1b\[[0-9;]*m", "", line)
            if PREFIX in line:
                code, duration = json.JSONDecoder().raw_decode(line.split(PREFIX, 1)[1])[0]
                if type(code) is not int or not 0 <= code < len(OPERATION_CODES):
                    raise ValueError("Unknown certificate timing operation code")
                # Collection emits only HTTP 200 preview/completed responses without fault headers.
                samples.append({"operation": OPERATION_CODES[code], "duration_ms": duration,
                                "status": 200, "controlled_fault": False,
                                "state": "COMPLETED", "layer": "newman"})
    if args.playwright_dir.exists():
        for path in sorted(args.playwright_dir.glob("*.json")):
            payload = json.loads(path.read_text(encoding="utf-8"))
            samples.extend({**sample, "layer": "browser"} for sample in payload["samples"])
    result = summarize(samples)
    args.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print("Certificate request timings (successful, completed requests; controlled faults excluded):")
    for row in result["measurements"]:
        print(f"  {row['layer']} {row['operation']}: n={row['count']}, p50={row['p50_ms']}ms, "
              f"p95={row['p95_ms']}ms, max={row['max_ms']}ms")
    if result["missing_operations"]:
        print("  No successful samples for: " + ", ".join(result["missing_operations"]))
    print(f"Timing evidence: {args.output}")


if __name__ == "__main__":
    main()
