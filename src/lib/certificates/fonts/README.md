# Certificate fonts

Embedded in certificate PDFs by `../pdf.ts`. Both families are licensed under
the SIL Open Font License 1.1 (licence texts alongside); neither declares a
Reserved Font Name.

| File | Family, style |
| --- | --- |
| `CormorantGaramond-SemiBold.ttf` | Cormorant Garamond 600 (title, program) |
| `CormorantGaramond-MediumItalic.ttf` | Cormorant Garamond 500 italic ("This is to certify that") |
| `CormorantGaramond-BoldItalic.ttf` | Cormorant Garamond 700 italic (student name) |
| `Inter-Regular.ttf`, `Inter-SemiBold.ttf`, `Inter-Bold.ttf` | Inter 400 / 600 / 700 (all other text) |

These are **modified** (trimmed) versions of the static TTFs served by Google
Fonts. They keep only the characters a certificate may contain
(`../printable.ts`: Windows-1252 / WinAnsi) and the `kern` feature, with
hinting removed. pdf-lib's built-in subsetting drops glyphs from these fonts,
so the files are trimmed in advance and embedded whole (about 40 KB each).

To regenerate, with fontTools installed (`pip install fonttools`):

```sh
pyftsubset Original.ttf --output-file=Name.ttf --layout-features=kern --no-hinting \
  --name-IDs='*' --name-languages='*' --notdef-outline \
  --unicodes="U+0020-007E,U+00A0-00FF,U+0152-0153,U+0160-0161,U+0178,U+017D-017E,U+0192,U+02C6,U+02DC,U+2013-2014,U+2018-201A,U+201C-201E,U+2020-2022,U+2026,U+2030,U+2039-203A,U+20AC,U+2122"
```

If `printable.ts` ever allows more characters, regenerate the fonts to match.
