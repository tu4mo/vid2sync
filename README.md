# vid2sync

Line up a video with separately recorded audio, then export them together as one MP4. Everything runs in the browser and no files are uploaded.

## Using it

1. **Import.** Use each track's **Import…** button, or drop files anywhere on the window. Video goes on the Video track and audio on the Audio track. Drop a single file onto a track to put it there, for example a video onto Audio to use only its sound. You can drag videos straight from macOS Photos. If the drop doesn't contain a file, try Safari, or drag the video to the Desktop first.
2. **Sync.** Drag clips along the timeline and use the waveforms to line them up. For precise work, select a clip and type its start in milliseconds in the inspector, or use the nudge buttons or the arrow keys. The inspector shows how far the audio is ahead of or behind the video.
3. **Mix.** Each track has a mute button (**M**) and a volume slider from 0 to 200%. Double-click the slider to reset it to 100%.
4. **Pick a range** (optional). The handles on the ruler mark what gets exported, the whole video to start with. Drag them to trim; they snap to the playhead and clip edges (hold **Shift** to not snap). Or press **I** and **O** to set the start and end at the playhead. Double-click a handle to put it back at the video's edge, or the range to reset both (or press **X**).
5. **Export MP4.** The video frames are copied as they are, with no re-encoding and no quality loss, and cuts are frame-exact. The audio is your mix, encoded as AAC (or Opus if the browser can't encode AAC) and aligned to the sample.

## How it works

- **Playback.** Both tracks' audio plays through Web Audio, on a single shared clock. The video element is muted and follows that clock, so what you hear stays in sync even when the video stutters.
- **Export.** [Mediabunny](https://mediabunny.dev) copies and trims the video stream. The audio mix is rendered offline, using the same clip placement as playback (`scheduleClips` in `src/media.ts`), so the export matches the preview. The encoder adds about 44 ms of silence at the start of AAC audio. vid2sync measures that once and cancels it with an MP4 edit list.

## Development

```sh
npm install
npm run dev            # dev server
npm run build          # type-check and build
npm run lint           # oxlint
npm run test:e2e       # Playwright smoke test (starts its own server on port 5289)
npm run test:fixtures  # regenerate tests/fixtures/clip.mp4 and tone.wav
```

The smoke test (`tests/smoke.spec.ts`) runs the whole flow in Chromium: import, sync, mute and volume, play/pause, range, and export. It then decodes the exported file to check its duration, where the audio starts, and the audio's pitch and level.

Pushing to `main` deploys to GitHub Pages (`.github/workflows/pages.yml`): it lints, builds and runs the smoke test, then publishes `dist` only if they all pass. The build uses relative paths, so it works at `https://<user>.github.io/<repo>/` under any repo name.

Dependencies are pinned to exact versions. `.npmrc` keeps it that way (`save-exact`) and only installs releases that are at least 3 days old (`min-release-age=3`).
