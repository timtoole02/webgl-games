# AFTERBURN: Orbital Assault

[Open the game](afterburn-orbital-assault.html). A side-scrolling arcade shooter with permanent invincibility, four upgradeable weapons, Overdrive, and a three-phase flagship battle.

The yellow-and-black Hornet has honeycomb armor and reflective metal engines. Layered planets, cliffs, mountains, industrial structures, crystal caves, and reactor tunnels surround the flight corridor. Passages and speed streaks move right to left at fixed depth, matching the ship's horizontal flight; explosion fragments can fly toward the camera. Mode 7-inspired decks use the same horizontal travel direction.

The original procedural soundtrack combines an SNES-style melodic hook with distorted guitars, bass, drums, and orchestral accents. The boss gets a separate industrial metal composition, **Iron Maw**, with heavier arrangements as its phases advance. Music, sound effects, geometry, and textures are generated in the page; there are no bundled song recordings or external art assets.

## Run

Open `afterburn-orbital-assault.html` in a modern browser, or run this from the repository root:

```sh
node tests/afterburn/serve.cjs
```

Visit `http://127.0.0.1:4173` and select **LAUNCH ASSAULT** to enable audio. No game build or npm installation is needed. Three.js **0.174.0** and its addons load from jsDelivr, so an uncached launch needs internet access. `PORT` changes the local server port.

On Windows with Chrome installed, double-click **Play-NVIDIA.cmd** to request the high-performance GPU in a separate, maximized game window. The launcher stores its browser profile in `%LOCALAPPDATA%\AfterburnOrbitalAssault\Chrome`. The GPU badge and **TUNE** drawer report the WebGL renderer actually selected. The flag requests the high-performance adapter; the browser and system configuration determine the result. Opening the HTML in an existing Chrome session does not apply that launcher flag.

## Controls

| Action | Keyboard |
| --- | --- |
| Move | WASD or arrow keys |
| Toggle autofire | Space |
| Select weapon | 1–4 |
| Cycle weapons | Q / E |
| Overdrive | X |
| Pause / resume | P / Escape |
| Mute / unmute | M |
| Tuning drawer | Backquote |

Touch controls include a movement stick and weapon/Overdrive buttons. **TUNE** contains music and effects volume, presentation settings, and shortcuts to the mountain pass, caves, gates, reactor tunnel, and boss. The shield is intentionally unlimited.

## Browser verification

Use Node.js 20 or newer, install the isolated test dependencies once, and keep the local server running in another terminal:

```sh
cd tests/afterburn
npm ci
npm test
```

The scripts default to Chrome at `C:/Program Files/Google/Chrome/Application/chrome.exe`. Set `CHROME_PATH` to another Chrome/Chromium executable on other installations or platforms. `GAME_URL` overrides the server address. A shared Playwright installation can also be supplied through `NODE_PATH` instead of `npm ci`.

- `verify.cjs`: controls, audio headroom, sectors, weapon upgrades, Overdrive, boss phases, victory/replay, debris pools, and phone controls.
- `verify-score.cjs`: complete main/boss arrangements, stereo output, headroom, voice cleanup, and the boss music transition. Set `SAVE_FULL_SCORE=1` to export the full WAV mixes.
- `verify-arcade.cjs`: bee armor, metal fleet, terrain density and parallax, boss clearance, batching, and resource reuse. Set `EXPECTED_GPU=NVIDIA` to additionally require an NVIDIA renderer; omit it for other hardware.
- `verify-passages.cjs`: horizontal passage axes, leftward travel, fixed depth and scale, offscreen recycling, pause, boss clearance, and phone framing.
- `visual-check.cjs`: screenshots of the title and seven route locations. Set `HARDWARE=1` to request the high-performance GPU.

Gameplay and audio checks use software WebGL. Arcade and passage checks request the high-performance GPU. These checks do not establish a hardware-independent frame-rate guarantee. JSON reports, PNG screenshots, and WAV previews are generated in the ignored `tests/afterburn/artifacts/` directory.

Browser diagnostics are exposed as `window.__afterburnDiagnostics` after `window.__afterburnReady` becomes true.
