# Chinese Lyrics

A [Spicetify](https://spicetify.app) extension for Spotify's built-in lyrics:

- **Traditional → Simplified** Chinese conversion (via [opencc-js](https://github.com/nk2028/opencc-js))
- **Pinyin** with tone marks (via [pinyin-pro](https://github.com/zh-lx/pinyin-pro)): below the characters, above them, or pinyin only
- **English translation** under each line (off by default)

Click the **拼** button in the top bar to change the options.

## Install

Search for **Chinese Lyrics** in the Spicetify Marketplace, or install it by hand: copy `chinese-lyrics.js` into your Spicetify `Extensions` folder, then run

```sh
spicetify config extensions chinese-lyrics.js
spicetify apply
```

## Notes

- English translation sends each song's lyric lines to Google Translate's public endpoint. It's off until you turn it on.
- Pinyin uses each character's most common reading, so characters with several readings (了, 长, 行…) are sometimes wrong.
- Both libraries are bundled into `chinese-lyrics.js` by `build.sh`. Edit `src/chinese-lyrics.js`, then run `./build.sh`.

## License

MIT
