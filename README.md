# Strata

*Your listening, carbon-dated.*

Your entire listening history (Spotify, Apple Music, Deezer, YouTube Music or TIDAL) as a geological core sample. You don't scroll a timeline; you drill down through a stratum for every year, each coloured by the music you lived in, until you hit bedrock: the first track you ever streamed, presented like a fossil in a museum case.

- **Pure static site.** Your export is parsed in the browser (JSZip in a Web Worker). No backend, no OAuth, no API quotas.
- **Five services, one core.** Drop exports from several services together and they merge; bedrock is the earliest stream across all of them.
- **Hours become rock.** Depth is measured in hours listened; each year's thickness is proportional to how much you listened; each month inside it is a lamina coloured by that month's top artist.
- **Colour from the sleeves.** Covers come from the same service as the track (Spotify oEmbed, iTunes, Deezer, YouTube thumbnails); dominant colours are pulled from the art and pushed toward stone. Without art, colours are hashed from artist names.
- **Hear the era, from the service you heard it on.** Each stratum's three characteristic tracks play through the platform they were streamed on: Spotify's own player (by the exact track ID in your export), Apple Music's and Deezer's 30-second clips, YouTube's player. TIDAL offers no keyless lookup, so its tracks link out instead.
- **Drag through time.** Grab the ruler or the core to move the rock; drag the depth readout to race through the whole core.
- **Bedrock.** The page goes still, the case lights up, and you can download a 1080×1350 share card with your first stream and your whole cross-section.

## Run it

```bash
npm install
npm run dev
```

## Your own core

| Service | How to get the export | What Strata reads |
|---|---|---|
| Spotify | [spotify.com/account/privacy](https://www.spotify.com/account/privacy/) → **Extended streaming history** (back to your first play; *Account data* covers only the last year) | `Streaming_History_Audio_*.json` or `StreamingHistory_music_*.json` in the zip |
| Apple Music | [privacy.apple.com](https://privacy.apple.com/) → Request a copy → **Apple Media Services information** | `Apple Music - Play History Daily Tracks.csv`, refined with `Apple Music Play Activity.csv` for the exact time of your first stream. Nested zips and multi-part downloads are handled. |
| Deezer | Account settings → privacy / personal data → request your data | the `10_listeningHistory` sheet of `deezer-data_*.xlsx` (English or French headers) |
| YouTube Music | [takeout.google.com](https://takeout.google.com/) → YouTube and YouTube Music → history | `watch-history.html` or `.json`, entries headed “YouTube Music”. Takeout has no play durations, so each play is estimated at 3½ minutes and depths are marked ≈. |
| TIDAL | No self-serve download: email TIDAL support for your personal data | `streaming.csv` (TRACK rows; local times converted from each row's time zone) |

Drop the file(s) on **Bring your own**, as delivered.

## The sample core

`public/sample.json` contains **aggregates only**: per-year top artists and tracks, monthly totals, and the first stream. It has no raw play log, timestamps beyond the first stream, IP addresses or device data. Cover art URLs and colours are resolved ahead of time so the sample makes zero API calls.

To rebuild it from an export:

```bash
npm run sample -- private/paul_spotify_data.zip --label "Paul's core"
```

The sample on display is the real listening history of [Paul Bouharoun](https://paulbouharoun.com), who built Strata: ten strata from 2017 to 2026, down to bedrock on 10 January 2018. The raw export lives in `private/`, which is git-ignored and never published.

`npm run synthetic` writes a realistic fake export in Spotify's exact format, used by the tests below.

## Tests

```bash
npm run synthetic && npm run fixtures && npm test
```

`fixtures` re-encodes the synthetic history into each service's real export format (Deezer xlsx with shared strings, Apple's nested zip, Takeout HTML/JSON, TIDAL CSV). `test` parses every one and checks streams, hours, top artists and bedrock against the Spotify ground truth.

## Stack

Svelte 5 + Vite · Canvas 2D for the procedural rock · JSZip · IM Fell English and IBM Plex Mono · deployed on Vercel.

```
src/lib/parse.js       any export → normalized plays (unzips, sniffs each file, merges services)
src/lib/sources/       one adapter per service: spotify, apple, deezer, youtube, tidal
src/lib/aggregate.js   plays → strata (the only shape that leaves the parser)
src/lib/rock.js        procedural core rendering: laminae, clasts, grain, cracks, cylinder shading
src/lib/card.js        the share card
src/components/        Surface (landing), Descent (the drill), Stratum, Ceremony (bedrock)
scripts/               synthetic export generator, per-service fixtures, parser checks, sample builder
```
