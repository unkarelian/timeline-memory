# Loading Screen Assets

Place your custom assets here for the loading screen feature.

## How to Add Assets

1. Place your files in the appropriate folder:
   - `music/` - for ambient music files (.mp3, .ogg, .wav)
   - `backgrounds/` - for background images (.png, .jpg, .jpeg, .gif, .webp)

2. **Edit `src/loading-screen.js`** to add your files as pairs in the `assetPairs` array:

```javascript
const assetPairs = [
    { background: 'waterfall.png', music: 'uwasotemperate.mp3' },
    { background: 'castleTown.png', music: 'myCastleTown.mp3' },
    { background: 'your-image.png', music: 'your-music.mp3' },
    { background: 'silent-bg.jpg', music: null }, // no music for this one
];
```

Each time the loading screen appears, one pair is randomly selected and both the background and music from that pair are used together.

## Default Pairs

- `waterfall.png` + `uwasotemperate.mp3`
- `castleTown.png` + `myCastleTown.mp3`

## Default Behavior

If no asset pairs are configured (empty array):
- A gradient background (Undertale-inspired dark blue theme) will be shown
- No music will play (silent operation)
