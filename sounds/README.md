# Sounds

The game plays the files in this folder. Each one can be replaced: keep the
same file name and the game uses the new file the next time the page loads.
If a file is missing, the game falls back to a synthesized version of that
sound, so nothing breaks.

**Listen to every file, and to how the game combines them:** open
`sound-test.html` on the live site
(https://git-vixxiv.github.io/Derby-1/sound-test.html).

## What each file is

| Files | What it is | What to look for in a replacement |
|---|---|---|
| `engine_loop.wav` | A car idling. The game loops it and raises the pitch with the revs. | A V8 idling at a steady speed, 2 to 5 seconds, no other noises, no change in revs. WAV (MP3 leaves a gap at the loop point). |
| `hit_1.mp3` … `hit_6.mp3` | The metal-on-metal impact. Every crash plays one. | A single sharp impact on sheet metal or a car body, under 1 second, starting right at the hit. |
| `thud_1.mp3` … `thud_4.mp3` | The low, heavy body of a hit. Added from medium hits up. | A dull, bassy thump with little ring, under 1 second. |
| `debris_1.mp3` … `debris_4.mp3` | Loose metal and trim coming down just after a hard hit. | Metal clattering or crumpling, about 1 second. |
| `glass_1.mp3`, `glass_2.mp3` | Glass breaking, on the biggest hits only. | A short glass break, under 1 second. |

The best possible source is a recording of a real derby or a real car being
hit: one clean impact per file. Any number of each kind works; to add more
(say `hit_7.mp3`), add the name to the list at the top of `js/audio.js`.

Format: MP3 or WAV, mono or stereo, any sample rate. Trim silence from the
start so the sound begins immediately.

## How a crash is built

- Light hit: one `hit`, quiet and slightly high.
- Medium hit: `hit` + `thud`, then `debris` a moment later.
- Heavy hit: two `hit`s + `thud` + `debris` + `glass`, all played lower and louder.

## Where the current files came from

See `CREDITS.md`. All are CC0 (public domain dedication) from OpenGameArt.
