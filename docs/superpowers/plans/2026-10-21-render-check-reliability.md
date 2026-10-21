# Render integration check reliability

Scope: preserve production runtime behavior while making integration checks meaningful under concurrent build/test load. All work onmain, no branches. Actual RED evidence: fullsuite402pass/1fail/1skip; worker identity regression expected completion after fixed50ms but only8of10fake steps completed. Full lint also traversed git-ignored .superpowers verification helper and reported6CJS/tooling errors; app/source scopedlintpassed.

1. Inspect worker-runtime.test.ts harness and replace fixed elapsed sleeps used as completion proof with condition/event-driven settlement helpers bounded by a reasonable failure timeout. Preserve explicit yield/cancel/fairness assertions and assertions that invalid identity cannot cancel the actual live job; never merely increase a sleep or suppress assertions. Write/run a failing controlled delayed-step case proving completion waits for the requested job's actual result. Keep production runtime/service untouched.
2. Exclude only .superpowers/** ephemeral SDD workspace from ESLint global files; keep application source/tests and real scripts linted. Existing global lint output is RED; rerunlintGREEN apart fromknownprototypewarnings. Do not lint generated task logs/scripts as product source or weaken source lint rules.
3. Run focused worker/runtime+service tests, scopedtestlint and fullnpmtest; fullsuite justified by observedfailure. Productionbuild alreadypassed aftergeometry/projectchanges; no repeatbuildunlessnewproductionchange. Save report with exact commands/results, have freshscopedreview beforecheckpoint.

Ownership: src/render/worker-runtime.test.ts, eslint.config.mjs only, plus taskreport. No source runtime, projectcontract, geometry or prototype edits. Preserve all others.
