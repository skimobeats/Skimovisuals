# Skimovisuals

A Windows app that turns your tracks into audio reactive music videos. Load a WAV, build up layers of visuals, images and effects on a timeline that react to your kicks, snares, hats and bass, then export an MP4 for socials.

## Installing on Windows

1. Go to the **Releases** page of this repository (right hand side of the repo's main page on GitHub).
2. Open the newest **Skimovisuals build** and download the `Skimovisuals Setup x.x.x.exe` file.
3. Run it. Because the app is not signed with a paid certificate, Windows may show a blue "Windows protected your PC" box. Click **More info** and then **Run anyway**.
4. Choose where to install it and finish. A desktop shortcut is created.

A new installer is built automatically every time the code changes. If you ever cannot find a release, open the **Actions** tab, click the latest successful "Build Windows app" run and download **Skimovisuals-Setup** from the bottom of the page.

## Using it

1. **New project**: pick a shape (9:16 for TikTok, Reels and Shorts, 16:9 for YouTube and so on), a resolution from 720p to 4K and a frame rate.
2. **Audio tab**: load your master WAV, or switch to **Stems** and load each stem, telling it which is drums, bass, melody and so on. Type in your BPM. Kicks, snares and hats are detected for you and shown as lanes on the timeline. Click a lane to add a hit, drag to move it and right click to remove it. Use the sensitivity sliders if it picks up too much or too little.
3. **Sections**: press **M** to drop a marker (intro, build, drop and so on), or press **Suggest sections**.
4. **✨ Generate for me**: pick a style, colours and energy and it builds a full set of layers that follow your track. Press **🎲 Try another** for a different take. Everything it makes can be edited.
5. **Skimo tab**: add your stencil logo for the whole song. Everything below shows through the letters, each letter reacts to its own part of the track (S kick, K snare, I hats, M bass, O melody) and the shape glitches, skews, stretches, slips and breathes. Pick a logo style (Reactive, Clean, Print, Chaos, Melt) and add a "SKIMO:TRACK NAME" title.
6. **3D hero shapes** (Visuals tab): Orb, Crystal, Monolith, Ring, Shard cloud, Liquid blob and a 3D Logo slab. Shards push out on the kick, scatter on the snare, spike on the hats, ripple with the melody, breathe with the bass and can burst apart on drops, throwing debris on big kicks. Put them under the Skimo logo.
   **Into a photo:** select a 3D hero, choose a photo under **Background scene** in its settings, then click **Place in the scene** and click the preview. The app works out the depth of the photo (a few seconds, once per photo), so things nearer than the shape hide it, it sits on the ground with a real shadow or floats, picks up the photo's light and reflections, and the camera drifts gently with parallax.
7. **Build it yourself**: drag visuals, effects, images and text onto the timeline. Higher tracks sit on top of lower ones, and effects change everything on the tracks below them.
8. **Transitions tab**: drag a transition (crossfade, Skimo wipe, glitch cut, zoom and more) onto the join between two clips that touch on the same track. Drag the round handles on a clip's top corners to set its fades.
9. **Make things react**: click a layer, then the 🔗 button beside any setting and pick Kick, Snare, Bass, Beat and more. Amount sets how strongly it reacts and Release sets how quickly it settles.
10. **Animate**: the ◇ button beside a setting adds a keyframe at the playhead, so values can change over the song.
11. **Colour tab**: choose a Skimo palette (or pastels and more), take colours from an image, make your own, add colour changes at points in the song or let it cycle palettes on the beat. Under "Colours react to the music" you can swap colours on hits, shift hue with the bass and brighten on the kick.
12. **🎛 Perform**: hold keys Q to H for live effects like strobe, kaleidoscope and glitch. Turn on **Record**, press play, and your pad hits and slider moves are saved to the timeline to edit afterwards.
13. **Presets tab**: save a single layer or a whole look and reuse it on your next release.
14. **Export video**: MP4 (H.264 with AAC audio). Your NVIDIA card's encoder is used automatically when available. Try **15 sec test** first to check how it looks. Each quality shows its file size before you export. **Draft for sharing** always comes in under 180 MB at the best quality that fits, ready to send for opinions (in WhatsApp, send it as a Document so it is not compressed again).

Projects save as `.skimo` files. The app remembers the last folder you used for projects, exports, audio and images separately. The app also autosaves every minute; use **Recover last autosave** on the start screen if anything goes wrong.

### Shortcuts

| Key | Action |
| --- | --- |
| Space | Play or pause |
| Ctrl+Z / Ctrl+Y | Undo / redo |
| Ctrl+S | Save |
| Ctrl+B | Split at playhead |
| Ctrl+D | Duplicate |
| Ctrl+C / Ctrl+V | Copy and paste layers |
| Delete | Remove selection |
| M | Add section marker |
| ← → | Move one beat (hold Shift for a bar) |
| Ctrl+scroll | Zoom the timeline |
| Alt while dragging | Turn snapping off temporarily |

## For developers

Built with Electron, React, WebGL2 shaders and FFmpeg.

```bash
npm install
npm run dev        # run with live reload
npm run typecheck
npm run dist       # build the Windows installer into release/
```

* `src/engine/layers` holds every visual and effect as a GLSL shader with its settings.
* `src/audio` does the analysis (envelopes, spectrum and onset detection) in a web worker.
* `src/generate.ts` is the "Generate for me" logic.
* `electron/main.ts` streams rendered frames into FFmpeg for export.
* `src/engine/hero.ts` is the 3D engine; `src/scene` runs the depth model (Depth Anything V2 Small, Apache 2.0) with ONNX Runtime Web. `npm install` downloads the model into `models/` automatically and it is bundled into the installer.
