# Upload restriction test files (SEC-12 / SEC-13)

Harmless files for testing the Media Library restrictions in `cms/config/plugins.ts`:

| File | Expected |
|---|---|
| `script-in-image.svg` | Rejected (SVG denied — scripts in SVG are an XSS vector when served from the bank domain) |
| `page.html` | Rejected |
| `html-renamed.png` | Rejected — record whether Strapi checks real content (magic bytes) or only the extension/declared MIME type |
| Any file > `UPLOAD_MAX_FILE_SIZE_MB` | Rejected — create one with `head -c 11M /dev/urandom > big.bin` |

For malware-scanning tests use the standard EICAR test string from eicar.org only in an environment where your endpoint protection is expected to react; it is deliberately not stored in this repository.
