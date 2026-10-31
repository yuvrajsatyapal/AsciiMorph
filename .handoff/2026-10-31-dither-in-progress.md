# Dither in progress — resume here

User objective remains Dither closure, then remaining core styles → stacked effects → text/masks/lighting → animation exports → recipes/library/Flow. Characters is already committed/pushed at e7c723e. Real public3×/4× exports remain deferred. Do not reopen Characters or retry Pro/authentication. Main only; no new branch/worktree. The user subsequently authorized committing and pushing this unfinished checkpoint to main. Preserve all pre-existing untracked research/handoff files.

Checkpoint follows user's AGENTS.md context hygiene. No compact tool is available. Read docs/research/ascii-magic/2026-10-31/README.md and docs/specs/2026-10-31-dither-parity.md. This session did NOT close Dither.

## Checkpoint contents

- rust/src/styles/dither.rs: Strength0alwaysquantizes; strengthscalespatternthreshold/diffusionerror, notoutputRGB; contrastbyteclamp/tieseven; serpentine rows; roundedworkinggriddimensions and nearestpainting; ImageSampler integration. Explicit Original/100 bypasses shared backdrop re-composition; None yields clear Dither output. Other backdrop preparation is still NOT corrected. Test helper exposes cfg(test) functions for sampling tests only.
- NEW rust/src/styles/dither_sampling.rs + styles/mod.rs declaration: cooperative fixed-stack mip/bilinear Image sampler. No source/pyramid allocation or increased budget cap. One base read/workunit. Even-source128×64 oracle exact atpixel1/2/3/12. Candidate odd mip uses3-tap[1,2,1], not yet validated. Latest float32 unpremultiplication fix is in source.
- NEW capture script scripts/capture-dither-software-reference.mjs, sampling generator, strict playwright.dither-parity.config.ts + tests/e2e/styles/dither-parity.spec.ts, tests/fixtures/render/dither/*.rgba/metadata, 2026-10-31capture directories/report/spec.
- src/render/wasm-dither.test.ts and tests/e2e/styles/dither-worker.spec.ts raw-input scenarios use Original instead of None, matching public semantics. These changed scenarios still need rerunning against the final candidate.
- public/wasm/asciimorph_engine.wasm rebuilt candidate, NOT accepted as finished. Final checkpoint rebuild/checks may be in /tmp/dither-checkpoint-* logs. No Next build or production browser regression after these changes yet.

## Evidence and observed RED/GREEN

- Original WASM Strength0contradiction frozen in dither-original/reference-results-before-correction.json:22,400byte/128alpha differences at1×pixel2Floyd; all56same-scale preview/exportexact. This earlier numeric isolation used publicOriginal/localNone, so is NOT same-settings closure.
- Stronger dither-verified/reference-manifest.json has56identities, exactpublicsettings, sourcePNGhash, hashed Original visible-source proof, and genuinepublicpixel1alpha verification. All56PNGs exist, complete=true/sourceAlphaVerified=true. Runtime test probesbackend. This is the capture to use going forward.
- Candidate strict same-settings gate report:32/56RGBAexact, all56alphaexact, all56preview/exportexact. Bayer2/4/8/16, LinesH/V/D, allStrength0identities (includingpixel1/2/3/12), Bayer2Strength50pass. Diffusion4kernelsStrength50/100 and Halftone/Radial/WhiteNoise/BlueNoise remainRED. Never loosen thresholds.
- New independent native strength/error/serpentine tests failedfirst, then passed. Native sourcecontextOriginal/None failedfirst, thenpassed. Area sampler oracle failedalpha128versus127, then newImageSampler passedallfourfullframes.
- Full native suite passed after primary sampling integration BEFORE the extra oddpartialalpha regression. That newtest is intentionally RED. /tmp/dither-full-native.log is not proof the latest full suite isgreen.
- Latest /tmp/dither-odd-followup.log: pixel1partialalpha fixed using f32 normalized reciprocal; pixel2stillfails atbyte0 (red27vs26; underlyingalpha19vs20). Independent continuousbilinear/roundedpremult matchesall160alpha but leaves7–8RGBerrors, first(x0,y1)premulred17vs18alpha79. Need isolate coordinate/FMA/rounding. p3/12oddmip NOTvalidated.
- Typecheck/lint before latest edits passed; final checkpointlogs mustbeinspected. Scoped native18tests passed before oddtestaddition. Current candidate code not independently accepted.

## Independent review

Skill requesting-code-review authorized read-only reviewer /root/dither_evidence_review. Evidenceholes fixed through a NEWcapture: sourceproofhash+alpha, fullvisibleDOMcontrols, nonconstantmonocontent, backendruntimeprobe, explicitlocalOriginal settings. It found ImagevsCanvas samplingpath and exactfloat32inverse-scalemodel. Review is NOT implementation acceptance. It never edited files. Reuse agent for followup if available. Diagnostic script /tmp/review-dither-image-sampler.mjs. Official numerical attribution already in rust/third-party/skia-LICENSE. No reference bundles executed or hidden state used.

## Next work

1. Inspect checkpoint logs and resume odd/partialalpha sampler investigation, keeping failing oracle test. Avoid broad samplerpath assumptions; Canvas vs PNGImage differs. Add tinyfraction/FMA probes before changes. Keep cancellation/workbound/budget checks.
2. Diffusion precision: current3rowerror buffers accumulate f32 deltas startingzero then addbase inf64atprocessing. Reference initializes eachcell'scontrastprocessedbyte asf32, then eachneighboradds roundedf32intoTHATvalue. Need cooperativeprefill ofcurrent+2future rows, not unboundedfullplane. Also transparentcells inreferenceprocessquantization/error even whenalpha0; currentcandidate skipsalpha0. Isolate with independentfixtures and observedREDfirst. No newbudgetcap.
3. Correct Halftone/Radius/noise patterns. Bayer/Linesalreadyexact atbaseline. All15remain genuine. Preserve independentnoiseprovenance; no aliases, toleratedRGBA, or copiedapplicationexecution.
4. Expand evidence asneeded: namedpalettes/chroma, defaultBlur8/upstreambackdrop semantics. CurrentOriginal100gate is bounded raw-sourceprofile; do NOT claim fulldefaultDither closure fromit. PubliceffectFrame Noneisblank, Original100returnssource; touchedBlur/partialOriginal samplespreparedbackdrop beforedither, unlike currentpost-composer. Public commoncharactersopacity/coverage/brightness may be ignoredbyDither; avoidassuming downstreamcomposition.
5. RebuildWASM, runexactgate until56/56thenanyexpandedcaseszeroRGBA, exactpairs. Runfreshfullnative/JS/typecheck/lint/build +actualworker/productionregressionsPixel/Mosaic/Characters. IndependentreviewandfixloopbeforeclosingDither. Thenremainingorderedobjective.

## Capture details / pitfalls

Pinned Chromium156.0.8078.4, --use-angle=swiftshader --enable-unsafe-swiftshader --disable-accelerated-2d-canvas. Browser/listenerlaunchrequires sandboxescalation (authorizedcapture/testlaunches succeeded). Welcome closes asynchronously; explicitvisible→forceclose(noWaitAfter)→hidden→2sec readiness works. Upload via actualfilechooser, neverfirsthiddeninput/CropSave. UI rangehelper skipsunchangedvalues; otherwiseHome/End+keys. Dither controlsappear after spatial-style-select selects dither; no exact Ditherbuttonexists.

Capture dither-software isREJECTEDfullyblank Nonebackdrop diagnostic. dither-original isearlierweakerprovenance; dither-verified iscurrentstrictcapture. Keepallhistory; do notstageindiscriminately.

Final checkpoint build/typecheck/scopedESLint/rustfmt/diffcheck PASS. Candidate WASM SHA256524a475b81673b155cb74b6091c504f950c98a48fb46bc9e1a50250908226e60. Fresh exactgate started against this binary; inspect /tmp/dither-checkpoint-parity.log and dither-verified/reference-results.json. The odd/partial-alpha regression remains intentionallyRED, so this is not a shipping/closure checkpoint.
Fresh checkpoint exactgate finished against524a475b...:32/56RGBAexact,56/56alphaexact,56/56same-scale preview/exportexact. Overallgate correctlyFAILS for remaining24RGBAcases; fullreport retained in dither-verified/reference-results.json and /tmp/dither-checkpoint-parity.log. No thresholds changed. Source andbinary nowcorrespond.

## Commit verification

Fresh JavaScript suite: 854 passed, one existing skip. Fresh Rust library suite: 75 passed, one known odd-size partial-alpha sampling failure; Cargo stops before integration suites on that failure. Scoped ESLint, rustfmt and staged diff checks pass. All 56 reference PNG hashes, the source proof, and all 12 sampling fixture hashes verified. This checkpoint intentionally preserves the failing regression and does not claim Dither closure. Unrelated historical research and failed-capture artifacts are excluded from the commit.

Fresh optimized Next production build, including TypeScript and static generation, passes.
