# Embedded certificate assets

Noto Sans Regular and Bold (static hinted TTF) are bundled under the SIL Open Font License 1.1 in OFL.md. Sources: https://github.com/notofonts/notofonts.github.io/tree/main/fonts/NotoSans/hinted/ttf and https://github.com/google/fonts/tree/main/ofl/notosans. The font covers Latin, Greek, and Cyrillic. The renderer rejects missing glyphs rather than silently substituting spaces. Additional scripts require explicit font/shaping support.

porto-marine-logo.png is the existing company SVG from ams-frontend-cloudscape/public/porto-marine-logo.svg, rasterized during the approved layout proposal. Rendering uses only embedded assets, without network/font dependencies. Template version: pms-examination-a4-v1. gopdf is pinned to v0.38.1 (MIT): https://github.com/signintech/gopdf/tree/v0.38.1.

SHA-256 of bundled bytes:

- NotoSans-Regular.ttf: 478c558ea716033cd60c03438f628dfa75694dcf6b5f6d505a2f05fd2b4f3823
- NotoSans-Bold.ttf: 1df075a380fc7cb898acf64c1f7b3b4dd780de3caa860178bf929de35817a913
- porto-marine-logo.png: 35770cde91af8a7890c8c261113cc8cf27ce89c3a28f8a28801727dae6c927ff

