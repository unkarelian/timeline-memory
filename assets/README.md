# Loading Screen Assets

Add your own music and backgrounds here to customize the loading screen experience.

**Note:** Assets are not included by default. You can add your own!

## How to Add Assets

Simply drop numbered files into the folders:

```
backgrounds/
  1.png
  2.jpg
  3.png

music/
  1.mp3
  2.mp3
  3.ogg
```

- Files are automatically paired by number (1.png + 1.mp3, 2.jpg + 2.mp3, etc.)
- **Supported background formats:** png, jpg, jpeg, gif, webp
- **Supported music formats:** mp3, ogg, wav
- Numbers 1-20 are supported
- Music is optional - a background without matching music will play silently
- For mini-game music, add a file called `game.mp3` to the music folder

Each time the loading screen appears, one pair is randomly selected.

## Suggested Sources for Free Assets

- **Music:** [Incompetech](https://incompetech.com/), [Freesound](https://freesound.org/), [OpenGameArt](https://opengameart.org/)
- **Backgrounds:** [Unsplash](https://unsplash.com/), [Pexels](https://www.pexels.com/), [OpenGameArt](https://opengameart.org/)

## Default Behavior

If no assets are present:
- A gradient background will be shown
- No music will play
- The loading screen still works with fun facts and mini-games!
