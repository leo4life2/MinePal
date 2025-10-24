#!/usr/bin/env python3
"""Merge Electron macOS latest-mac.yml manifests from Intel and ARM builds."""

from __future__ import annotations

import argparse
import pathlib
import sys

try:
    import yaml  # type: ignore
except ImportError as exc:  # pragma: no cover - handled in CI
    print(f"PyYAML is required: {exc}", file=sys.stderr)
    sys.exit(1)


def load_yaml(path: pathlib.Path) -> dict:
    if not path.exists():
        raise SystemExit(f"Missing YAML file: {path}")
    with path.open("r", encoding="utf-8") as handle:
        data = yaml.safe_load(handle)
    if not isinstance(data, dict):
        raise SystemExit(f"YAML must contain a mapping: {path}")
    return data


def merge_list(dest: dict, intel: dict, arm: dict, key: str, identifier: str) -> None:
    items: dict[str, dict] = {}
    for source in (intel, arm):
        value = source.get(key)
        if not isinstance(value, list):
            continue
        for entry in value:
            if not isinstance(entry, dict):
                continue
            ident = entry.get(identifier)
            if not ident:
                continue
            items[str(ident)] = entry
    if items:
        dest[key] = sorted(items.values(), key=lambda item: item.get(identifier, ""))
    else:
        dest.pop(key, None)


def merge(intel_path: pathlib.Path, arm_path: pathlib.Path) -> dict:
    intel_data = load_yaml(intel_path)
    arm_data = load_yaml(arm_path)

    merged = dict(intel_data)

    merge_list(merged, intel_data, arm_data, "files", "url")
    merge_list(merged, intel_data, arm_data, "packages", "path")

    release_dates = [value for value in (intel_data.get("releaseDate"), arm_data.get("releaseDate")) if value]
    if release_dates:
        merged["releaseDate"] = max(release_dates)

    versions = {intel_data.get("version"), arm_data.get("version")} - {None}
    if len(versions) > 1:
        raise SystemExit("Version mismatch between macOS builds")
    if versions:
        merged["version"] = versions.pop()

    return merged


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("intel_yaml", type=pathlib.Path, help="Intel latest-mac.yml path")
    parser.add_argument("arm_yaml", type=pathlib.Path, help="ARM latest-mac.yml path")
    parser.add_argument("output_yaml", type=pathlib.Path, help="Merged output path")
    args = parser.parse_args()

    merged = merge(args.intel_yaml, args.arm_yaml)
    args.output_yaml.parent.mkdir(parents=True, exist_ok=True)
    with args.output_yaml.open("w", encoding="utf-8") as handle:
        yaml.safe_dump(merged, handle, sort_keys=False)

    return 0


if __name__ == "__main__":  # pragma: no cover - CLI entry point
    sys.exit(main())


