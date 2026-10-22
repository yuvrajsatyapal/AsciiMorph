# Recipe contrast domain — unresolved compatibility boundary

The first four-control Characters profile intentionally accepts contrast-100..100, matching the recorded widget range. This is an initial profile boundary, not proof that every reference recipe fits that domain.

Read-only decoding of the retained `website-surfaces.json` same-origin anchor query parameter `r` (URL-safe base64 JSON, never executed) reveals:

| Retained JSON path | Recipe mode | Contrast | Other distinguishing fields |
| --- | --- | ---: | --- |
| `discovered_same_origin_anchors[15].url` |characters |135 |fontSize10, grayscale100, bgBlur2, vignette/grain/dust/bloom |
| `discovered_same_origin_anchors[16].url` |characters |125 |fontSize10, charSet01, coverage96, green screen overlay, charBloom/scanLines/vignette |
| `discovered_same_origin_anchors[66].url` |mosaic |115 |fontSize14, coverage100, pink overlay, chromatic/scanLines/bloom/vignette |

These are published link data. This inspection does not establish whether opening the editor preserves, clamps, adapts or rejects those values, nor how its widget displays them. Recipe implementation must resolve that behavior with runtime evidence before claiming compatibility. Do not silently clamp these recipes to100 or treat the first profile's validated domain as a complete recipe schema. Their additional controls/effects are also outside the first context and must not disappear during import.

This finding does not widen the accepted first profile or alter its tested numeric contract. Full recipe support remains an open parity requirement.
