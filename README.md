# vid2sync

Line up a video with separately recorded audio, then export them together as one MP4. Everything runs in the browser and no files are uploaded.

## Using it

1. **Import.** Click **Import** in an empty track, or drop files anywhere on the window. Video goes on the Video track and audio on the Audio track. Drop a single file onto a track to put it there, for example a video onto Audio to use only its sound. You can drag videos straight from macOS Photos. If the drop doesn't contain a file, try Safari, or drag the video to the Desktop first.
2. **Sync.** Drag clips along the timeline and use the waveforms to line them up. The label between the tracks shows how far the video is ahead of or behind the audio; click it to type the offset in milliseconds (**↑**/**↓** step it live). Or select a clip and nudge it with the arrow keys (hold **Shift** for bigger steps). When both clips are in, vid2sync matches the video's own sound against the audio file and lines them up for you if it finds a clear match, such as a clap, or you playing along to the track in headphones. The wand button in the toolbar does it again after you've moved them. When there's nothing to match on, its tooltip says why.
3. **Mix.** Hover a clip's volume icon to slide out its volume, from 0% (muted) to 200%. Double-click the slider to reset it to 100%. To fade a clip's sound in or out, hover over the clip and drag the dot at its top-left or top-right corner inward. Fades snap like trim edges (hold **Shift** to not snap), stay attached to the clip's edges when you trim, and are linear. Double-click a dot to remove the fade. Once a clip has a fade, a second dot at the bottom moves where the fade-in starts or the fade-out ends, leaving the clip silent between it and the edge. Double-click it to move it back to the edge.
4. **Trim** (optional). Drag a clip's start or end edge to trim it. The video's trimmed part is what gets exported; trimming the audio cuts sound you don't want, such as a count-in. The edges snap to the playhead and clip edges (hold **Shift** to not snap). Or press **I** and **O** to trim the selected clip's start and end to the playhead (the video's when nothing is selected). Double-click an edge to put it back at the file's edge, or press **X** to reset both. Trimming doesn't move the rest of the clip, so the sync holds.
5. **Export MP4.** The video frames are copied as they are, with no re-encoding and no quality loss, and cuts are frame-exact. The audio is your mix, encoded as AAC (or Opus if the browser can't encode AAC) and aligned to the sample.

## How it works

- **Playback.** Both tracks' audio plays through Web Audio, on a single shared clock. The video element is muted and follows that clock, so what you hear stays in sync even when the video stutters.
- **Export.** [Mediabunny](https://mediabunny.dev) copies and trims the video stream. The audio mix is rendered offline, using the same clip placement as playback (`scheduleClips` in `src/lib/playback.ts`), so the export matches the preview. The encoder adds about 44 ms of silence at the start of AAC audio. vid2sync measures that once and cancels it with an MP4 edit list.

## Development

```sh
npm install
npm run dev            # dev server
npm run build          # type-check and build
npm run lint           # oxlint
npm run format         # oxfmt
npm test               # unit and browser tests (Vitest)
npm run test:e2e       # Playwright end-to-end tests (they start their own server on port 5289)
npm run test:fixtures  # regenerate tests/fixtures/clip.mp4 and tone.wav
```

The end-to-end tests (`tests/*.spec.ts`) cover each feature in Chromium: import, sync, volume, play/pause, trimming, fades, deleting, and export. Each starts from the fixture clips imported through a shared fixture (`tests/lib/test.ts`). The export tests decode the exported file to check its duration, where the audio starts, and the audio's pitch and level.

Pushing to `main` deploys to GitHub Pages (`.github/workflows/pages.yml`): it lints, builds and runs the tests, then publishes `dist` only if they all pass. The build uses relative paths, so it works at `https://<user>.github.io/<repo>/` under any repo name.

Dependencies are pinned to exact versions. `.npmrc` keeps it that way (`save-exact`) and only installs releases that are at least 3 days old (`min-release-age=3`).
