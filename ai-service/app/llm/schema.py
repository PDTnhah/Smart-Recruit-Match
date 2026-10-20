"""The JSON Schema sent with a structured-output request (CONTEXT D34).

Claude and Gemini accept different JSON Schema subsets. This builds the part both accept from a
Pydantic model: `$ref` inlined, `oneOf` (Pydantic discriminated unions) read as `anyOf`,
`additionalProperties: false` on every object, and numeric and string constraints dropped. Pydantic
still validates every constraint when the answer arrives. A structure the subset cannot express
(tuples, `not`, conditionals, free-form mappings, recursion) is an error, not a silent `{}`.
"""

import copy
from typing import Any

from pydantic import BaseModel

KEPT_KEYWORDS = frozenset(
    {"type", "properties", "required", "items", "enum", "anyOf", "description", "format"}
)
KEPT_FORMATS = frozenset({"date-time", "date", "time"})
UNSUPPORTED_KEYWORDS = frozenset(
    {
        "prefixItems",
        "not",
        "if",
        "then",
        "else",
        "patternProperties",
        "dependentSchemas",
        "allOf",
    }
)
DEFS_PREFIX = "#/$defs/"


def strict_json_schema(output_model: type[BaseModel]) -> dict[str, Any]:
    raw = output_model.model_json_schema()
    defs = raw.pop("$defs", {})
    return _clean(raw, defs, ())


def _clean(node: dict[str, Any], defs: dict[str, Any], seen: tuple[str, ...]) -> dict[str, Any]:
    if "allOf" in node and len(node["allOf"]) == 1:
        siblings = {key: value for key, value in node.items() if key != "allOf"}
        return _clean({**node["allOf"][0], **siblings}, defs, seen)
    if "oneOf" in node:
        siblings = {k: v for k, v in node.items() if k not in ("oneOf", "discriminator")}
        return _clean({**siblings, "anyOf": node["oneOf"]}, defs, seen)
    if "$ref" in node:
        ref = node["$ref"]
        name = ref.removeprefix(DEFS_PREFIX)
        if not ref.startswith(DEFS_PREFIX) or name not in defs:
            raise ValueError(f"unsupported $ref {ref!r}")
        if name in seen:
            raise ValueError(f"recursive schemas are not supported: {' -> '.join((*seen, name))}")
        siblings = {key: value for key, value in node.items() if key != "$ref"}
        return _clean({**copy.deepcopy(defs[name]), **siblings}, defs, (*seen, name))

    unsupported = UNSUPPORTED_KEYWORDS.intersection(node)
    if unsupported:
        raise ValueError(f"output models must not use {sorted(unsupported)} in their schema")
    extra = node.get("additionalProperties")
    if extra not in (None, False):
        raise ValueError("output models must not hold free-form mappings (additionalProperties)")
    if node.get("type") == "object" and not node.get("properties"):
        raise ValueError("output models must not hold objects without declared fields")

    result: dict[str, Any] = {}
    for key, value in node.items():
        if key == "const":
            result["enum"] = [value]
        elif key not in KEPT_KEYWORDS:
            continue
        elif key == "format":
            if value in KEPT_FORMATS:
                result[key] = value
        elif key == "properties":
            result[key] = {name: _clean(sub, defs, seen) for name, sub in value.items()}
        elif key == "items":
            result[key] = _clean(value, defs, seen)
        elif key == "anyOf":
            result[key] = [_clean(sub, defs, seen) for sub in value]
        else:
            result[key] = copy.deepcopy(value)
    if "properties" in result:
        result["additionalProperties"] = False
    return result
