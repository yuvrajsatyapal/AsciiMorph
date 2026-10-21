# Character placement follow-up

Static read-only inspection on 2026-10-21 of the already retained common renderer; no downloaded code was executed or incorporated into production. Exact ranges and source SHA-256 are in [the evidence JSON](character-placement-evidence.json).

The common renderer sets the scaled Courier New/Courier/monospace font with **top** baseline. In the ordinary unscaled non-bitmap path, it forwards column×cell width plus a horizontal offset and row×cell height plus a vertical offset to its character drawing helper. The helper's ordinary fillText call uses those coordinates unchanged. Depth, animation, bitmap and batched WebGL branches require separate checks.

No textAlign assignment was found in the bounded common-renderer slice [95000,115000); this does not prove the effective alignment inherited by its context. Actual platform font pixels remain unverified.

Current calibration centers glyphs with a middle baseline. The geometry extension deliberately preserves that behavior. Before character pixel-parity acceptance, provide explicit placement semantics and a real-browser fixture rather than assuming wider cell bounds also reproduce the reference font rasterization.
