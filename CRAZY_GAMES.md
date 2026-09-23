# Crazy Games build

Block Party ships two static builds:

| | GitHub Pages / other hosts | Crazy Games |
| --- | --- | --- |
| Command | `npm run build` | `npm run build:crazygames` |
| Output | `dist/` | `dist-crazygames/`, copied to `artifacts/crazygames/` |
| Upload zip | — | `artifacts/block-party-crazygames.zip` (`index.html` at the zip root) |
| Asset paths | relative (`./`) | relative (`./`), safe for iframe hosting |
| AlterU / Aigram | optional; `guest-shell.js` plus the host bridge. Active when the shell or host establishes an Aigram session | **off**. Guests play immediately. No login wall and no App Store link |

## Guest play

Crazy Games requires that guests can play and that the game does not add its own login (including AlterU / Aigram) before play. This build:

- Opens the splash and starts a run on the first drag. There is no account screen and no `guest-shell.js` login wall.
- Saves the best score in `localStorage` on the device (the same best-score key the game already uses).
- Opens the leaderboard as a local note (“best score stays on this device”) instead of “Open in AlterU” / the App Store.
- Does not treat Crazy Games query parameters as an Aigram session.

The default `npm run build` path is unchanged for GitHub Pages and any AlterU/Aigram embed. That build still includes `https://images.aiwaves.tech/alteru/guest-shell.js`.

The Pages workflow publishes this guest build next to the root site, without replacing it:

https://yinxinghuan.github.io/block-party/crazygames/

Progress sync through the Crazy Games SDK Data module is not wired up. Local best score is enough for this version.

## Build the upload package

```bash
npm ci
npm run build:crazygames
```

Upload `artifacts/block-party-crazygames.zip` in the Crazy Games developer portal. Do not submit from this repository’s automation.

`artifacts/crazygames/` is the same unpacked folder (`index.html` plus `./assets/...`) if you need to preview it:

```bash
npx --yes serve artifacts/crazygames
```
