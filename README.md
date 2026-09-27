<div align="center">

<img src="build/icon.png" width="128" alt="Tubify logo">

# Tubify

**An unofficial desktop client for YouTube and YouTube Music.**

Tubify opens the official youtube.com and music.youtube.com websites in a lightweight Windows app.<br>
It also adds an optional ad and tracker blocker, SponsorBlock, a local music library and a media saver, and needs no account.

[![Latest release](https://img.shields.io/github/v/release/1ZoZ1/tubify?style=for-the-badge&cacheSeconds=3600&color=ff4d4d&label=download)](https://github.com/1ZoZ1/tubify/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/1ZoZ1/tubify/total?style=for-the-badge&cacheSeconds=3600&color=ff8a24)](https://github.com/1ZoZ1/tubify/releases)
[![Platform](https://img.shields.io/badge/platform-Windows%2010%20%7C%2011-4fd350?style=for-the-badge)](#download)
[![License](https://img.shields.io/github/license/1ZoZ1/tubify?style=for-the-badge&cacheSeconds=3600&color=0fb86a)](LICENSE)

**English** · [Türkçe](README.tr.md)

<img src="docs/screenshots/video.png" alt="Tubify: video mode" width="900">

<sub>Tubify is an independent open-source project. It is not made, endorsed or supported by Google LLC or YouTube. See the <a href="#legal">legal notice</a>.</sub>

</div>

---

## What is Tubify?

Tubify is a desktop app with two tabs:

- **Video**, which opens **youtube.com**
- **Music**, which opens **music.youtube.com**

Both tabs load the official websites as they are, served straight from YouTube. Tubify doesn't host, mirror, re-stream or change any video or music. On top of the sites, it adds the kind of user-side tools people already use in their browsers: an ad and tracker blocker, SponsorBlock, keyboard shortcuts and a local library.

- **Fast and focused.** No browser tabs and no extensions to manage. Playback starts quickly and keeps going in the tray.
- **The real sites.** Subscriptions, comments, recommendations and 4K/HDR playback work exactly as they do on the website.
- **Nothing to sign up for.** Your music library, playlists and liked songs are stored on your PC. Signing in to YouTube is optional and happens on Google's own login page.

## Features

| | |
|---|---|
| 🛡️ **Ad & tracker blocking** | Optional, and on by default. Uses the public uBlock Origin, EasyList and EasyPrivacy filter lists, just like a browser extension. You can turn it off any time in Settings. |
| ⏭️ **SponsorBlock** | Community-submitted segments (sponsor reads, intros, outros, reminders) are skipped automatically. There's an undo button, and each category can be turned on or off. |
| 🎵 **Music mode** | music.youtube.com with a sidebar library: local playlists, liked songs, queue, shuffle, repeat and autoplay. |
| 💾 **Media saver** | Saves videos or audio that **you have the right to save**, such as your own uploads or Creative Commons and public-domain works. Built on yt-dlp and FFmpeg. Tubify does **not** handle DRM-protected content. |
| 🌙 **Runs in the tray** | Closing the window keeps your music playing. Control playback from the tray icon, or quit from its menu. |
| 🔒 **Private** | No telemetry and no analytics. Websites can't use notifications, location, camera or microphone. |
| 🌍 **Türkçe & English** | Pick your language on first launch and change it any time in Settings. |
| ⌨️ **Keyboard shortcuts** | `Ctrl+1/2` switches between video and music, `Ctrl+Shift+V` opens the link on your clipboard, `F11` goes fullscreen, and more. |

<div align="center">
<img src="docs/screenshots/music.png" alt="Tubify: music mode with local library" width="49%">
<img src="docs/screenshots/downloads.png" alt="Tubify: media saver" width="49%">
</div>

## Download

Two builds are available on the [latest release](https://github.com/1ZoZ1/tubify/releases/latest) page:

| File | For |
|---|---|
| **`Tubify-Setup-x.y.z.exe`** | Installer (recommended). Adds Start Menu and desktop shortcuts, and supports notifications and uninstall. |
| **`Tubify-Portable-x.y.z.exe`** | Single exe, no installation needed. Run it from any folder or a USB stick. Settings still live in `%APPDATA%\Tubify`. |

On first launch Tubify asks for your language and where to save files.

> **Windows SmartScreen** may warn you because the installer isn't code-signed. Click **More info → Run anyway**. If you prefer, you can read the source and build it yourself (see below).

**Requirements:** Windows 10 or 11 (64-bit) and about 300 MB of disk space. yt-dlp and FFmpeg are downloaded from their official sources the first time you use the media saver.

## FAQ

<details>
<summary><b>Is it free?</b></summary>

Yes. Tubify is open source under the MIT license. It has no ads, no paid tier and no tracking, and it doesn't make money in any way.
</details>

<details>
<summary><b>Do I need a Google account?</b></summary>

No. The music library, playlists, liked songs and queue are all stored locally. You *can* sign in to YouTube on Google's own login page to see your subscriptions and history. Tubify never sees or stores your password.
</details>

<details>
<summary><b>Can I turn off the ad blocker?</b></summary>

Yes: **Settings → Ad blocking**. If you enjoy a creator's work, consider supporting them directly or through YouTube Premium.
</details>

<details>
<summary><b>Where are my files and settings?</b></summary>

Saved files go to the folder you picked on first launch (by default `Downloads\Tubify`). Settings and your library live in `%APPDATA%\Tubify`, which you can open from **⋮ → Help → Open data folder**.
</details>

<details>
<summary><b>Something stopped working</b></summary>

Websites change often. Try **⋮ → Help → Update ad filters now**, then reload with `Ctrl+F5`. If it still doesn't work, please [open an issue](https://github.com/1ZoZ1/tubify/issues).
</details>

## Build from source

```bash
git clone https://github.com/1ZoZ1/tubify.git
cd tubify
npm install
npm start          # run in development
npm run dist       # build the installer and portable exe into dist/
```

Requires Node.js 20+ and Windows.

## Under the hood

- **Shell:** Electron with two `WebContentsView`s (video and music) under a custom frameless top bar and sidebar.
- **SponsorBlock:** segments come from the public [SponsorBlock API](https://sponsor.ajay.app).
- **Media saver:** [yt-dlp](https://github.com/yt-dlp/yt-dlp) + [FFmpeg](https://ffmpeg.org), fetched from their official releases into the app's data folder.
- **Library:** plain JSON on disk (`library.json`, `queue.json`).

### The ad-blocking engine

Tubify's ad blocking works on the user's own device, inside the user's own app session, the same way browser extensions such as uBlock Origin or AdGuard do. It doesn't touch YouTube's servers or other users, and it doesn't handle DRM or encrypted content.

#### Why a simple filter isn't enough anymore

On YouTube, ads are increasingly delivered **inside the same media stream** as the video (server-side ad placement). A blocker that only removes ad entries from the page data after they arrive tends to leave the player waiting on a black screen. We measured several approaches:

| Approach | What we saw |
|---|---|
| Remove ad entries from the player data after it arrives | Black screen and a 5–24 s delay before playback |
| Fast-forward the ad | Same delay |
| Speed up page timers | No effect |
| **Ask for the player data in a form that doesn't include ad placements** | **Playback in about 0.8 s** |

#### How it works

Like uBlock Origin, Tubify adjusts the **request** the page sends instead of editing the **response** afterwards. It has four layers:

**Layer 0: network filters** ([`src/main/adblock.js`](src/main/adblock.js))
Ghostery's open-source engine, loaded with the public uBlock Origin, EasyList and EasyPrivacy lists, blocks requests to known ad and tracking servers and hides ad elements with CSS. The lists update daily.

**Layer 1: player request** ([`src/preload/youtube.js`](src/preload/youtube.js))
1. A few experiment flags in the page's configuration are switched off so that the player request is sent as readable JSON.
2. The player request gets a `params` value that asks for playback without ad placements, and it's marked as a reload.
3. If a value isn't accepted for a video, Tubify falls back to the next one (`8AUB` → `YAHI` → the original request) for that video only. The unmodified request is always the last resort, so videos stay playable.

**Layer 2: response cleanup (safety net)**
Any ad-placement entries still in the player data are removed before the player reads them.

**Layer 3: playback guard (last resort)**
If an ad still plays, it's muted and skipped. Blocker-detection dialogs are closed, and the idle timestamp is refreshed so the "Continue watching?" prompt doesn't interrupt music.

#### How it differs from a browser extension

| | Browser + extension | Tubify |
|---|---|---|
| **When the code runs** | As a content script, which can load after the page's own scripts | In the page's main world **before any page script** (`contextBridge.executeInMainWorld`), so it is always in place first |
| **First page load** | The initial page data can still include ad entries | Tubify notices this and reloads the player once with a clean request, so direct links start cleanly too |
| **Rejected request** | Fixed by a later filter-list update | Detected from `playabilityStatus` and retried **for that video only** |
| **Generic scriptlets** | Injected on page load | Turned off on purpose, because they load too late and can break the page |

> Websites change often. Usually only the values in `src/preload/youtube.js` need updating. Pull requests are welcome.

## Contributing

Issues and pull requests are welcome. Please **don't** open issues or PRs that ask for DRM circumvention, downloading paid or members-only content, or anything else that would break copyright law. They will be closed.

## Legal

- **Unofficial.** Tubify is an independent, non-commercial open-source project. It is **not affiliated with, endorsed, sponsored or approved by Google LLC or YouTube**. "YouTube", "YouTube Music" and related names and logos are trademarks of Google LLC. They are used here only to say which websites the app opens (nominative use). Tubify doesn't use YouTube's logos in its own branding.
- **No content is hosted or distributed.** Tubify doesn't host, cache, re-stream or redistribute any video, audio or other content. Everything you watch or hear is served by YouTube to your own device, in your own session.
- **User-side tools only.** Ad blocking, SponsorBlock and the other features run only on your computer, and you can turn them off. They work the same way as widely used browser extensions.
- **No DRM circumvention.** Tubify doesn't decrypt, remove or bypass DRM or any other technical copy-protection measure, and it isn't intended to.
- **Your responsibility.** Only save content you own, have permission to save, or that is licensed for it (for example your own uploads, Creative Commons or public-domain works). You are responsible for following copyright law and [YouTube's Terms of Service](https://www.youtube.com/t/terms) in your country. The authors don't encourage or condone copyright infringement.
- **No warranty.** Tubify is provided "as is", without warranty of any kind, under the [MIT License](LICENSE). The authors aren't liable for how the software is used.
- **Takedown and contact.** If you are a rights holder and believe something in this repository infringes your rights, please [open an issue](https://github.com/1ZoZ1/tubify/issues) or contact the maintainer through GitHub. We will review it and respond promptly.

## Credits

- [SponsorBlock](https://sponsor.ajay.app) by Ajay Ramachandran and contributors. Segment data is licensed under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/).
- [uBlock Origin](https://github.com/gorhill/uBlock) filter lists, [EasyList](https://easylist.to) and [EasyPrivacy](https://easylist.to).
- [Ghostery adblocker](https://github.com/ghostery/adblocker) (MPL-2.0), [yt-dlp](https://github.com/yt-dlp/yt-dlp) (Unlicense), [FFmpeg](https://ffmpeg.org) (LGPL/GPL) and [Electron](https://www.electronjs.org) (MIT).

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for full license details.

<div align="center">
<sub>Made with ❤️ in Türkiye · <a href="LICENSE">MIT License</a> · Not affiliated with Google LLC or YouTube</sub>
</div>
