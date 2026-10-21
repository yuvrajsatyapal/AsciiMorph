# UI font delivery evidence

Observed directly through the official pages on 2026-10-21 using the in-app browser; web text extraction had returned only a JavaScript shell. Read-only inspection, no download, font copying, explicit license acceptance or project font change. Temporary research tab closed.

The official [Satoshi page](https://www.fontshare.com/fonts/satoshi) identifies the family as Closed Source / ITF Free Font License. The official [FFL page](https://www.fontshare.com/licenses/itf-ffl) displayed version2.0 dated17Aug2026. Section1 permits own website/app use and self-hosting, and describes optional official API delivery. Section2 restricts redistribution through repositories and making fonts selectable for third-party content creation. API availability is not guaranteed by section6.

Implementation inference: use the official hosted CSS for the application’s interface, with a fallback, rather than placing Satoshi binaries in this public repository. Keep it outside the user-selectable artwork/text font catalog. UI appearance depends on successful font loading; offline exact-font parity remains unproved. Do not infer an OFL grant or unrestricted redistribution from free commercial use. A later self-hosting/distribution decision requires a separate license-aware packaging review.
