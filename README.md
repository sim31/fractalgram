# Fractalgram

Telegram web client tailored for participants of [Eden](https://www.edenelections.com/) / [fractally](https://fractally.com/) style DAOs.

This is a fork of [Telegram Web A](https://github.com/Ajaxy/telegram-tt), which adds some additional features to help run [Eden](https://www.edenelections.com/) / [Fractally](https://fractally.com/) style meetings. Specifically it adds some buttons to automate creation of polls and other kinds of messages which help reach consensus in these meetings.

[See introductory post for details](https://peakd.com/dao/@sim31/introducing-fractalgram).

## Local setup

```sh
mv .env.example .env

npm i
```

Obtain API ID and API hash on [my.telegram.org](https://my.telegram.org) and populate the `.env` file.

## Dev mode

```sh
npm run dev
```

### Invoking API from console

Start your dev server and locate GramJS worker in console context.

All constructors and functions available in global `GramJs` variable.

Run `npm run gramjs:tl full` to get access to all available Telegram requests.

Example usage:
``` javascript
await invoke(new GramJs.help.GetAppConfig())
```

### Dependencies
* [GramJS](https://github.com/gram-js/gramjs) ([MIT License](https://github.com/gram-js/gramjs/blob/master/LICENSE))
* [pako](https://github.com/nodeca/pako) ([MIT License](https://github.com/nodeca/pako/blob/master/LICENSE))
* [cryptography](https://github.com/spalt08/cryptography) ([Apache License 2.0](https://github.com/spalt08/cryptography/blob/master/LICENSE))
* [emoji-data](https://github.com/iamcal/emoji-data) ([MIT License](https://github.com/iamcal/emoji-data/blob/master/LICENSE))
* [twemoji-parser](https://github.com/twitter/twemoji-parser) ([MIT License](https://github.com/twitter/twemoji-parser/blob/master/LICENSE.md))
* [rlottie](https://github.com/Samsung/rlottie) ([MIT License](https://github.com/Samsung/rlottie/blob/master/COPYING))
* [opus-recorder](https://github.com/chris-rudmin/opus-recorder) ([Various Licenses](https://github.com/chris-rudmin/opus-recorder/blob/master/LICENSE.md))
* [qr-code-styling](https://github.com/kozakdenys/qr-code-styling) ([MIT License](https://github.com/kozakdenys/qr-code-styling/blob/master/LICENSE))
* [mp4box](https://github.com/gpac/mp4box.js) ([BSD-3-Clause license](https://github.com/gpac/mp4box.js/blob/master/LICENSE))
* [music-metadata-browser](https://github.com/Borewit/music-metadata-browser) ([MIT License](https://github.com/Borewit/music-metadata-browser/blob/master/LICENSE.txt))
* [lowlight](https://github.com/wooorm/lowlight) ([MIT License](https://github.com/wooorm/lowlight/blob/main/license))
* [idb-keyval](https://github.com/jakearchibald/idb-keyval) ([Apache License 2.0](https://github.com/jakearchibald/idb-keyval/blob/main/LICENCE))
* [fasttextweb](https://github.com/karmdesai/fastTextWeb)
* webp-wasm
* fastblur

## Bug reports and Suggestions
If you find an issue with this app, let Telegram know using the [Suggestions Platform](https://bugs.telegram.org/c/4002).
