# Public website screenshot capture manifest

Date: 2026-10-20. **Incomplete: browser unavailable; zero captures.**

The requested hidden IAB tab could not be created: `cua.createBrowserTab("iab", "https://www.ascii-magic.com/", { visible: false })` returned `Browser is not available: iab`. `cua.listBrowsers()` returned an empty list. No tab was created, no viewport was changed, and no existing user/prototype tab was touched.

This records a capture plan and blocker, not visual baseline evidence. The earlier surface audit inspected two transient 1280×720 views but did not retain their pixels. Those observations must not be represented as saved screenshots.

Requested desktop CSS viewport: **1280×900**. Actual raster dimensions, document viewport, scale factor and clipping must be filled from successful captures. Twelve representative planned views:

| Capture | Exact observed URL | Intended view |
| --- | --- | --- |
| home-hero | https://www.ascii-magic.com/ | Hero, announcement and navigation; top of page |
| home-post-effects | https://www.ascii-magic.com/#postfx | Representative landing effects section; scroll to observed section |
| styles-catalog | https://www.ascii-magic.com/styles | Categorized style discovery cards |
| recipes-catalog | https://www.ascii-magic.com/recipes | Client-rendered recipe preview cards |
| text-to-ascii | https://www.ascii-magic.com/text-to-ascii | Text banner input, live preview and option controls |
| blur-tool | https://www.ascii-magic.com/tools/blur-text | Default Blur mode with before/after and output actions |
| censor-tool | https://www.ascii-magic.com/tools/censor-text | Dedicated censor controls and before/after |
| text-faces | https://www.ascii-magic.com/tools/text-faces | Face and emoji browse/search/copy shell |
| library | https://www.ascii-magic.com/ascii | Library search, category/look controls and previews |
| library-detail | https://www.ascii-magic.com/ascii/abu-simbel-colossi | Representative player/look and integration/export template |
| readme-banner | https://www.ascii-magic.com/ascii/banner | Distinct README banner maker preview/settings |
| docs | https://www.ascii-magic.com/docs | Distinct documentation navigation/article/contents shell |

A conditional 390×844 homepage view is planned when supported viewport controls are available. It establishes responsive CSS appearance only; it does not verify coarse-pointer, touch or a physical mobile device.

The screenshot set remains blocked on IAB availability. No alternative capture mechanism was used. Reference UI artwork/media is retained only as investigation evidence and supplies no permission to redistribute it in the recreated product.
