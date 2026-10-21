# Public website surface audit

Date: 2026-10-20. Reference: https://www.ascii-magic.com/. Scope: public routes beyond the Studio/Flow and renderer investigations. This is an acceptance inventory for subsequent plans, not a parity completion claim.

## Evidence and coverage

Started from actual homepage anchors and followed observed anchors. Fetched 55 exact routes: **53 HTTP 200 and two HTTP 404**. Inspected ten pages in a temporary hidden IAB tab through `cua_repl`, including safe local option changes. Inspected transient screenshots of the landing page and README banner maker at 1280×720. Those screenshots were not retained as baseline artifacts. The tab was closed afterward. No existing user tabs or local prototype were used.

Labels: **HTML** means fetched first-party HTML parsed inertly; a control in HTML may be hidden, client-populated, or inactive. **UI** means runtime accessibility or screenshot observation, with executed behavior stated explicitly. **DOC** means a published description, not operation tested. **HTTP** means status only. No downloaded JavaScript was executed by analysis tools. No login, purchases, form submission, uploads, MCP calls, AI calls, downloads, clipboard changes, or exhaustive blog crawl occurred.

[website-surfaces.json](./website-surfaces.json) retains exact route URLs, response status, source hashes/byte lengths, technical controls/options, 1,196 observed same-origin anchors with source pages, 734 piece URLs, runtime observations, and 17 prioritized acceptance families. Raw fetched HTML is temporary under `/tmp/ascii-magic-surface-html`; proprietary page/artwork bodies are not included in the JSON. Hashes establish snapshot identity but do not replace durable captures.

## Shared navigation and landing

UI at [home](https://www.ascii-magic.com/): a near-black framed page, announcement strip, horizontal top navigation, white rectangular Open tool CTA, large before/after demonstration, pixel display headings and sans-serif body. At 1280×720 the central page frame starts about 129px from either side. The first hero comparison spans the page frame, with BEFORE/AFTER labels, a central drag handle, and style pills along its bottom edge. The title and CTA begin beneath the demonstration. This describes the observed desktop viewport only.

Primary links: Styles, Recipes, FAQ anchor, Tools menu, Library, Blog, Changelog, Pricing, and `/app`. Footer adds Docs, Community, company/legal pages and external tool links. Runtime home links on some utility pages include `/?show-landing=1`; preserve that observed navigation distinction when analyzing routing.

The landing's ordered surfaces are: announcement/navigation → hero comparison → community creations → grouped style cards → use cases → post-effects demo → six recipe highlights → generative preview → MCP introduction → testimonials → FAQ accordions → featured badges → final CTA/footer. UI confirms the following controls exist; most were not executed:

- Comparison slider initially 50; named style pills and overflow menu. The automatically changing preview image labels establish a rotating demo, not a general-purpose editor.
- Fourteen post-effect toggles: Vignette, Scan Lines, CRT Curvature, Chromatic Aberration, Bloom, Character Bloom, Film Grain, Glitch, RGB Split, Blur, Halftone, Pixelate, Film Dust, Color Overlay.
- Community and use-case tracks, external attributed creation links, and a use-case submission affordance. No submission dialog/form was exercised.
- Generative subject tabs Jules, Marcus, Noah, Yuki, and preset preview links to `/app`; 171 is a published count. No independent generative website route was observed.
- FAQ expandable questions and provider-specific Ask AI buttons. Their external workflows were not invoked.

HTML CSS identifies `Satoshi` 400/500/700, Latin-subset `Satoshi-Phone`, and `GeistPixel-Square` display families. Visible shell tokens include background `#040406`, foreground `#FFFFFF`, border `rgba(255,255,255,0.10)`, CSS maximum width `1728px`, content width `1470px`, side padding `129px`, and text inset `47px`. These are reference measurements; no font reuse permission is inferred.

## Prioritized route acceptance inventory

P0 is required functionality for the user's complete scope, not permission to omit P1. P1 is later delivery order for discovery/editorial/support surfaces or unresolved destinations.

| ID | Priority | Exact route family | Future acceptance boundary | Evidence / remaining work |
| --- | --- | --- | --- | --- |
| WEB-01 | P0 | `/` | Shared shell, navigation/announcement, hero comparison/style choice, ordered demo/discovery sections and genuine destinations. | HTML+UI; compare/toggle interactions and mobile untested. |
| WEB-02 | P0 | `/styles`, `/styles/ascii-art`, `/styles/dither`, `/styles/video-to-ascii` | Catalog/grouping and independently useful embedded guide editors; selected look opens full studio. | HTML; three guide templates sampled; other guide controls not inferred. |
| WEB-03 | P0 | `/recipes` and four details below | 20 cards, previews/tags, apply/code-copy, detail examples and related recipes. | UI catalog; HTML details; apply/copy untested. |
| WEB-04 | P0 | `/tools`, `/text-to-ascii` | Directory and text banner generation including fonts/ramps/looks/animation/frame options and real exports. | HTML+UI; picker opened, encodes untested. |
| WEB-05 | P0 | `/tools/image-to-ascii` | Plain-text photo converter with selectable source, grid/tone/color and text/PNG output. | HTML+UI sample output; upload/export untested. |
| WEB-06 | P0 | `/tools/video-to-ascii` | Independent video/GIF preview and frame grabber; whole-clip export destination in Studio. | HTML+UI; motion/performance unverified. |
| WEB-07 | P0 | `/tools/text-faces` | Face and emoji-combo browse/search/copy with Unicode retained. | HTML controls; search/copy untested. |
| WEB-08 | P0 | `/tools/glitch-text-generator` | Real combining-mark output with style/direction/intensity, shuffle/copy/text export. | HTML controls; runtime untested. |
| WEB-09 | P0 | `/tools/blur-text`, `/tools/censor-text` | All five hide-text modes, screenshot cover workflow, platform spoiler output and dedicated censor interface. | HTML+UI; digit masking and spoiler output verified; screenshot editing/export untested. |
| WEB-10 | P0 | `/ascii`, `/ascii/category/landscapes`, `/ascii/abu-simbel-colossi` | Catalog/category/detail templates; player/restyling, code integrations, exports, source/share. | HTML; 734 anchors/24 category buttons; only representative leaf fetched. |
| WEB-11 | P0 | `/ascii/banner` | Separate README SVG banner builder with settings, preview, export, snippets and shareable settings. | HTML+UI preview; exports/share untested. |
| WEB-12 | P1 | `/ascii/docs`, `/ascii/use`, `/ascii/use/website-loaders`, `/ascii/use/github-readme` | Integration docs, 18-use-case discovery, code examples, related pieces and FAQ states. | HTML; no editable builder controls found in two sampled use-case guides. |
| WEB-13 | P0 | `/docs` and 14 linked pages below | Distinct docs shell/navigation, section anchors, copy/Markdown, contents, previous/next and search. | HTML+UI search overlay; queries/results untested. |
| WEB-14 | P1 | `/blog`, `/changelog`, `/community`, `/about`, `/contact`, `/featured`, `/privacy`, `/terms`, `/licenses`, `/refund` | Editorial/support/legal pages with own content/assets; actual filtering, contact handling and release navigation where present. | HTML; no external posts or article bodies crawled, no contact submission. |
| WEB-15 | P0 | `/pricing` | Billing cycle and credit selections update quotes/entry context; real account/commercial services only under independent policy. | UI yearly and 100-credit changes verified; authentication/checkout untested. |
| WEB-16 | P0 | `/mcp-server`, `/docs/mcp`, `/docs/mcp-tools`, `/docs/generative`, `/docs/deep-links` | Authenticated service contracts, credits/refunds and actual supported agent operations; resolve contradictions below. | DOC only, no service execution. |
| WEB-17 | P1 | `/styles/glass`, `/styles/ascii-and-text` | Specify intended group discovery behavior before implementation. | Actual linked URLs return HTTP 404; no functional reference template established. |

## Discovery/detail templates

[Styles](https://www.ascii-magic.com/styles) contains categorized cards, preview links, Pro labels, full-guide links, and group links. There are 31 unique observed `/styles/*` anchor targets: 21 named style guides and ten groups. Group anchors are `ascii-and-text`, `pixel-and-blocks`, `print-and-paper`, `geometric`, `glass`, `distort`, `blur-effects`, `glitch-effects`, `light-and-color`, `material`. Only the first and glass were requested in this bounded group check; both return 404. The other eight are link observations only. Do not turn a linked label into a working route claim.

The three fetched style guides contain embedded mini editors, separate from `/app` and `/tools/*`:

- [ASCII guide](https://www.ascii-magic.com/styles/ascii-art): image chooser; seven glyph-mode options (characters, block, lines, diagonal, cross, diamond, mixed); cell 4–24; contrast 0–200; brightness −100–100; dark threshold 0–100; source color and invert; PNG and text-copy actions.
- [Dither guide](https://www.ascii-magic.com/styles/dither): image chooser; seven algorithm options (Floyd–Steinberg, Atkinson, Stucki, Sierra Lite, Bayer 2/4/8); eight palette options; cell/tone/source-color/invert; PNG output. The guide's longer copy cites different algorithm counts; mini-editor options and full studio inventory are separate.
- [Video style guide](https://www.ascii-magic.com/styles/video-to-ascii): despite the topic, its fetched embedded control accepts `image/*` and says Choose an image. It exposes the same glyph/tone mini editor as the ASCII guide. Do not infer video input from its title.

[Recipe catalog](https://www.ascii-magic.com/recipes) is client-populated: its initial HTML grid is empty, but runtime shows **20 cards**. Names: Matrix, Noir, Vaporwave, Bonsai, Memento, Cumulus, Daybreak, Blueprint, Retro CRT, Newsprint, Pixel Pop, Mosaic, Inferno, Acid, Golden Hour, Botanica, Dream, Blue Hour, Lost Signal, Sepia. Cards expose preview/apply, tags, Copy code, and some Learn more links. Four verified HTTP-200 detail routes are [Matrix](https://www.ascii-magic.com/recipes/matrix-code-generator), [Noir](https://www.ascii-magic.com/recipes/noir-filter), [Sepia](https://www.ascii-magic.com/recipes/sepia-filter), [Vaporwave](https://www.ascii-magic.com/recipes/vaporwave-aesthetic). Their template includes demonstrations, examples across sources, recipe code/copy/apply, instructions and related recipes. Recipe deep-link semantics are documented separately; card apply was not clicked here.

## Standalone utility contracts

[Text to ASCII](https://www.ascii-magic.com/text-to-ascii): text input max 50, 20 FIGlet fonts, next/previous style, and eight character sets (Blocks, Alpha, Brutal, Thin, Numeric, Symbols, Katakana, Custom). Opening the runtime Style picker verified those lists. Six static looks: Plain, Neon, Gradient, Game Boy, Amber CRT, Dither. Ten motion looks: Liquid, Fire, Glitch, Hologram, Matrix, Bloom, Rainbow, Chrome, Ripple, Vapor. Frame options Auto/16:9/9:16/1:1/4:5; HTML includes custom ramp and scale 25–200, conditionally exposed rather than initially visible. Output controls: text copy, `.txt`, PNG, 5s/10s video and Random. A button does not establish successful MP4 encoding.

[Image converter](https://www.ascii-magic.com/tools/image-to-ascii): choose/drop/paste image and Inspire sample, plain-text output with source/grid/character metadata; width 20–300 step 2, row-density automatic or line-height 1.0/1.2/1.4/1.6/1.8, six predefined ramps plus custom, contrast 0–220, brightness −60–60, foreground color/picker/hex, Black/White/None background, invert/reset. A built-in sample produced a visible character grid. Copy text, `.txt`, PNG are visible. This plain-text tool is distinct from the Studio pixel export pipeline.

[Video converter](https://www.ascii-magic.com/tools/video-to-ascii): chooser accepts `video/*,image/gif`; built-in loop/Inspire, output canvas/grid/fps/source metadata; width 40–220 step 2, six ramps, contrast 40–260, light-on-dark/dark-on-light and separate invert; Pause, Export frame as PNG, reset. Its explicit scope is a player/frame grabber; whole-clip encode links to Studio. Initial hidden-tab UI showed 0 fps, so smooth playback is not established by this audit.

[Text faces](https://www.ascii-magic.com/tools/text-faces): page labels a 122-face catalog; two independent searches for faces and emoji combos, copy selected face/combo and direct shrug copy. Runtime filtering, copy feedback, complete emoji/category datasets and keyboard behavior remain unverified.

[Glitch text](https://www.ascii-magic.com/tools/glitch-text-generator): textarea max 200; Cursed, Corrupted, Zalgo, Void, Halo, Scratched, Strikethrough, Underline, Overline; Mild/Normal/Extreme; intensity 1–100; Up/Middle/Down; output/copy, Shuffle, `.txt`, Clear and contextual examples. Generating and copying combining-mark strings remains untested.

[Blur tool](https://www.ascii-magic.com/tools/blur-text): max-600 textarea and five independent modes, with mode-dependent output/actions:

- Blur: soft blur/pixelate, radius 0–30, size 16–72, Dark/Light/Transparent, Sans/Mono; canvas PNG and copy-image.
- Screenshot: choose/drop/paste image; solid block/blur/pixelate; black/white block; intensity 2–30; box count, undo last/remove all, PNG/copy-image. Runtime empty-state controls confirmed. Move/resize/delete boxes are DOC descriptions, untested without loading an image.
- Spoiler: Discord/Reddit/Somewhere else, click/hover reveal preview, fallback cover glyph. Selecting Spoiler produced visible Discord `||…||` markup around the built-in example and copy/text-download actions. Other target formats untested.
- Censor: full cover / first-and-last / numbers only, glyph/custom and cover-spaces choices.
- Scramble: within-word / first-and-last / whole-text choices, reshuffle and text output.

[Dedicated censor](https://www.ascii-magic.com/tools/censor-text) is a separate page with three scope choices, eight cover characters plus custom max 2, cover-spaces, max-600 before text, after preview and copy. Selecting Numbers only on its built-in sentence masked its digits while preserving words. This verifies one transformation only; Unicode, empty input, preservation rules and copy require tests later.

## Animated library and banner

[Library](https://www.ascii-magic.com/ascii) exposes **734 unique actual piece anchors and 24 category buttons** in the fetched page, plus search, Shuffle and eleven look buttons. This is a dated website observation. The independently audited GitHub commit has **634 pieces**; do not assume the additional 100 website entries exist in that snapshot or share its license.

[Landscapes category](https://www.ascii-magic.com/ascii/category/landscapes) verifies a category template with piece previews, detail links, related category/use-case navigation. [Abu Simbel detail](https://www.ascii-magic.com/ascii/abu-simbel-colossi) verifies the richer piece page: player pause/0.5×/1×/2×, Dark/Light, size 5–20 and text copy; eleven looks, custom characters, contrast, dot size/density, monochrome and text-restyle options; HTML/React/Terminal/README/Agent snippets; GIF/video/image export controls; ten output framing choices including 4K, phone, square, stories, social headers and piece-only; Auto/Fill/Fit-inside; social/share actions; source tab and GitHub link. These are HTML observations, not export validation or proof every piece exposes identical controls.

[README banner maker](https://www.ascii-magic.com/ascii/banner) is an additional product surface, distinct from `/text-to-ascii`. Text max 40, subtitle max 80, 20 fonts, eight color options, five animation options (type-in+shimmer, type-in, shimmer, color-flow, static), four backgrounds; SVG download/copy, plain-text copy, PNG, link-to-settings, README/plain-text snippet tabs. Screenshot confirms the styled HELLO WORLD preview over checkerboard. Exported SVG animation/accessibility/share serialization were not tested.

[Library docs](https://www.ascii-magic.com/ascii/docs) covers open-source reuse, web component/npm/terminal integration, framework tabs, self-hosting and look APIs; code-copy controls and FAQ expansion are part of this template. [Use directory](https://www.ascii-magic.com/ascii/use) links **18 actual use-case routes** retained in JSON. Two sampled guides—[website loaders](https://www.ascii-magic.com/ascii/use/website-loaders), [README](https://www.ascii-magic.com/ascii/use/github-readme)—contain code examples/copy, related pieces, instructions and expandable/load-more FAQs. Neither fetched guide contains editable input controls; a general FAQ's mention of builders does not establish interactive builder availability on every guide.

## Docs, editorial, account and services

[Docs](https://www.ascii-magic.com/docs) uses a separate shell: top Docs/search/tool/pricing/changelog links, grouped left navigation, article, copy-page and Markdown, section anchors, right contents, previous/next, updated date. Search button opened a dedicated overlay with search input and results list; no query was submitted. Exact fetched leaves: `/docs/quickstart`, `/docs/concepts`, `/docs/free-vs-pro`, `/docs/interface`, `/docs/media`, `/docs/styles`, `/docs/effects`, `/docs/generative`, `/docs/export`, `/docs/mcp`, `/docs/mcp-tools`, `/docs/recipes`, `/docs/deep-links`, `/docs/limits`. Markdown links were observed but not fetched. Help inside Studio belongs to its audit.

[Blog](https://www.ascii-magic.com/blog) has 18 observed article links and All/Tutorial/Compare/Recipe/Style Spotlight/Use Case filters. Only the index was fetched. [Changelog](https://www.ascii-magic.com/changelog) has dated release entries with New/Fix/Improve tags; recent entries mention code export and top-bar help. These are published release claims, not independent feature tests. [Community](https://www.ascii-magic.com/community) has attributed creation cards and external social destinations. About, Featured and policy pages are public HTTP-200 templates. [Contact](https://www.ascii-magic.com/contact) has name/email/subject/message and Send message with a third-party form action; no submission tested. Use new copy and lawful attribution, not wholesale reproduction of marketing, testimonials or creation art.

[Pricing](https://www.ascii-magic.com/pricing): free/Pro comparisons, Monthly/Quarterly/Yearly, credit slider 20–300 step 10 and 20/50/100/200 presets. Runtime selecting Yearly changed to $4/month billed $48 and `/app?buy=pro&cycle=yearly`; selecting 100 credits changed to $21.25 and `/app?buy=credits&qty=100`. Initial monthly displayed $8/month; FAQ describes quarterly $7/month. These are dated reference prices, **not a commercial policy for AsciiMorph**. No checkout link was followed.

No standalone login/account route was observed. [Deep-link docs](https://www.ascii-magic.com/docs/deep-links) describes `/app?settings=account|plan|credits|about`, `r`, named `recipe`, saved `project`, `demo`, `tour` and purchase return context; precedence project → r → recipe → demo. `/connect` is documented for MCP OAuth handoff, not visited. Do not guess private account/settings layouts from those parameters.

[Generative docs](https://www.ascii-magic.com/docs/generative) describe 171 presets/ten groups, four subject covers, prompt/strength/resolution, account/credits, failure refund and output reuse. Published costs are 1/2/3 credits for 1K/2K/4K. No provider, actual response, account, generated asset, progress/retry/refund execution verified. This is a service provisioning boundary, not grounds to fake generation in the recreation.

[MCP page](https://www.ascii-magic.com/mcp-server) and [tool reference](https://www.ascii-magic.com/docs/mcp-tools) describe streamable HTTP endpoint `https://www.ascii-magic.com/mcp`, OAuth/dynamic registration and seven tools: `stylize_image`, `suggest_styles`, `list_styles`, `create_upload`, `encode_recipe`, `decode_recipe`, `account_status`. No dedicated video/generate/export tool is enumerated. Source URLs/upload handles feed image stylization; result link/preview, tier validation, recipe override and bounded scale are documented. No server tools invoked or account authenticated. Docs explicitly acknowledge an upload PUT returning OAuth 401 in the current production build; that is DOC evidence only, not reproduced here.

## License observations and unresolved acceptance

[Licences](https://www.ascii-magic.com/licenses) attributes Aberration, Fluted Glass and CMYK Drops to unmodified `@paper-design/shaders` shaders under Apache-2.0 and says fonts are web licensed and demo media owned/licensed stock. It describes other editor work as proprietary/original. These statements do not grant permission to redistribute the site's fonts, images, videos, copy, testimonials, interface code or additional library pieces. Pinned MIT repository files and their NOTICE exceptions remain governed by the separate GitHub audit. No reference asset or competitor source was added to production.

Material gaps/contradictions to carry into plans:

1. Website 734 pieces versus pinned repo 634; audited license provenance only covers the pinned eligible repository files.
2. Runtime recipe catalog 20 versus deep-link docs 19 named presets.
3. Generative docs say credit-gated for all tiers; pricing/MCP summaries imply Pro restrictions and pricing simplifies to one credit per render. Resolve actual service policy independently.
4. Home/MCP promotion mentions video/generative capability; documented seven tools establish only the narrower enumerated contract.
5. Two style group anchors are broken; remaining linked groups and unvisited style/detail/use-case pages lack runtime evidence.
6. No responsive/mobile baseline, runtime exports/clipboard, private account/persistence, payments, AI/provider, MCP operations or comparative performance has been tested here.
7. Public routes are not automatically uniform: image/video utilities, style mini editors, text banners, README banners, Studio and animated library are distinct workflows. Replacing all of them with links to Studio would omit verified functionality.
