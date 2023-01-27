# Fractalgram

Telegram web client tailored for participants of [Eden](https://www.edenelections.com/) / [fractally](https://fractally.com/) style DAOs.

This is a fork of [Telegram Web Z](https://github.com/Ajaxy/telegram-tt), which adds some additional features to help run [Eden](https://www.edenelections.com/) / [Fractally](https://fractally.com/) style meetings. Specifically it adds some buttons to automate creation of polls and other kinds of messages which help reach consensus in these meetings.

Explanation for how to use coming soon...

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
