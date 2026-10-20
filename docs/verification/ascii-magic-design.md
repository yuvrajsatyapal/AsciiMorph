# ASCII Magic rebuild design verification

2026-10-20. Design Gate: ACCEPT for the independent Studio/Flow prototype and provisional phone adaptation. This verifies a design artifact; production UI and renderer parity remain open in [reference-parity.md](reference-parity.md).

## Artifacts

- Prototype: `.planning/design/screens/ascii-magic-rebuild/prototype.html` with adjacent CSS/JS/assets.
- Desktop screenshot: `prototype-desktop.jpg` in the same folder,1280×900.
- Flow screenshot: `prototype-flow.jpg`,1280×900; contextual zoom/history toolbar and Styles/Effects segment.
- Phone screenshots: `prototype-phone-styles.jpg` and `prototype-phone-controls.jpg`,390×844. The latter now shows the controls sheet open.

## Browser observations

Search selected Dither; favorites retained its selection and exposed removal. Studio/Flow switched the toolbar and catalog labels, then restored Studio context. Phone document had no horizontal overflow; property rail targets measured44×44 and bottom sheet triggers195×47. Styles and Controls sheets were mutually exclusive. Bottom actions scroll horizontally on phone. A local design-preview PNG download was verified as1000×1000RGBA.

The prototype uses original botanical art. Downloaded preview output is a demonstration rendering, not Rust output. Generic treatments do not implement the96reference modes. Unconfigured remote services are labeled; arbitrary Flow graph editing remains unimplemented.

## Limits

Reference desktop screenshots were raster-clipped; measured DOM dimensions support shell reconstruction. Fine-pointer narrow captures did not expose the reference mobile shell. The phone design is a proposed accessible adaptation. Satoshi stylesheet is used in this disposable prototype; production font licensing/self-hosting is a later implementation check. Essential label contrast intentionally improves on the observed reference.

## Review

Independent design critic accepted dimensions, neutral tokens, Characters controls, corrected Flow context, keyboard/pressed states, reduced motion and proposed phone behavior. Acceptance excludes real renderers, complete responsive reference parity, production exports, services and full Flow editing.
