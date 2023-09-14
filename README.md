# Telegram Web Z

This project won the first prize 🥇 at [Telegram Lightweight Client Contest](https://contest.com/javascript-web-3) and now is an official Telegram client available to anyone at [web.telegram.org/z](https://web.telegram.org/z).

This is a fork of [Telegram Web Z](https://github.com/Ajaxy/telegram-tt), which adds some additional features to help run [Eden](https://www.edenelections.com/) / [Fractally](https://fractally.com/) style meetings. Specifically it adds some buttons to automate creation of polls and other kinds of messages which help reach consensus in these meetings.

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

## Bug reports and Suggestions
If you find an issue with this app, let Telegram know using the [Suggestions Platform](https://bugs.telegram.org/c/4002).
