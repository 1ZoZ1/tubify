# Third-party notices

Tubify's own source code is licensed under the MIT License (see [LICENSE](LICENSE)).
The installer bundles or downloads the following third-party software, each under its own license:

| Component | Use | License | Source |
|---|---|---|---|
| [Electron](https://www.electronjs.org) | Application runtime (includes Chromium and Node.js) | MIT (Chromium: BSD-style and others) | https://github.com/electron/electron |
| [@ghostery/adblocker-electron](https://github.com/ghostery/adblocker) | Network and cosmetic ad blocking engine | MPL-2.0 | https://github.com/ghostery/adblocker |
| [ffmpeg-static](https://github.com/eugeneware/ffmpeg-static) | Bundled FFmpeg binary for merging and converting downloads | GPL-3.0-or-later (FFmpeg build) | https://ffmpeg.org, https://github.com/eugeneware/ffmpeg-static |
| [yt-dlp](https://github.com/yt-dlp/yt-dlp) | Download engine, fetched at runtime from its official GitHub releases | Unlicense | https://github.com/yt-dlp/yt-dlp |
| [Deno](https://deno.com) | JavaScript runtime used by yt-dlp, fetched at runtime | MIT | https://github.com/denoland/deno |

## Data and filter lists

- **SponsorBlock**: segment data from https://sponsor.ajay.app, licensed under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/). Tubify is non-commercial and credits SponsorBlock as required.
- **uBlock Origin filters** (GPL-3.0), **EasyList / EasyPrivacy** (GPL-3.0 / CC BY-SA 3.0): filter lists downloaded at runtime and not modified or redistributed in this repository.

## FFmpeg

The FFmpeg binary shipped in the installer is an unmodified build provided by the `ffmpeg-static` package. It is a separate program that Tubify runs as a subprocess. Its source code is available at https://ffmpeg.org/download.html. The corresponding build scripts are linked from https://github.com/eugeneware/ffmpeg-static.

## Trademarks

YouTube and YouTube Music are trademarks of Google LLC. Tubify is not affiliated with or endorsed by Google LLC.
