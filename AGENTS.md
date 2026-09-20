# Repository guidance

- Keep the extension on Chrome Manifest V3.
- Keep host access limited to `https://skl.hdu.edu.cn/*` unless the product scope explicitly changes.
- Do not add code that bypasses CAPTCHA, authentication, or authorization controls.
- Store location profiles locally and never log precise coordinates.
- Preserve the native geolocation fallback when the extension is disabled.
- Run `npm run verify` before committing changes.
