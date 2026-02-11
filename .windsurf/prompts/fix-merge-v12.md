# Fix merge v12.0.16

1. Understand the [context](#context) of this project. Save it in memory if you think that makes sense and will be useful in the future;
2. Understand the [current problem](#the-current-problem)
3. Fix
4. Think about how to avoid the same issues in the future and maybe how to make the maintenance of this project easier;

## Context

This is a fork of Telegram Web Client:
* Original repository: https://github.com/Ajaxy/telegram-tt
* Repository of this fork: https://github.com/sim31/fractalgram

The purpose of this fork is to add some additional features which would help users fascilitate [respect game](https://github.com/sim31/frapps/blob/4e1728be502af8c53678a07695c9565c4958dd23/concepts/respect-game.md) sessions, using a process now known as ["fractalgram"](https://github.com/sim31/frapps/blob/4e1728be502af8c53678a07695c9565c4958dd23/concepts/fractalgram.md).

* This is an article introducing this fork and explaining its purpose and how to use that new functionality: https://peakd.com/dao/@sim31/introducing-fractalgram .

We have been using this app for a couple of years now. One of the problems with it is that it is hard to maintain. Things break from time to time, often because I think some server behaviour or its API changes. Then we have to merge the changes from the original repository, and this is has been the biggest challenge for me.

## The current problem

We are on the merge-v12-0.16 branch. I have merged upstream changes, resolved conflicts and made it compile. However, I'm observing the following issues:

1. When creating a poll for a level, participants which have already been ranked are shown [^1]. Refreshing the page does not help.
2. When creating a poll for a level, checkboxes are missaligned [^1]
3. When creating consensus results message, the message is empty (it seems that it does not process poll results) [^2]. After refreshing the page, the results are constructed correctly [^3].

Maybe I messed it up during the merge? The version before the merge was not working as well, but with slightly different issues:
* After creating a chat, it would not load fully;
* Some or all the messages would not go through;


[^1]: [img1](./resources/re-rank-and-checkboxes.png)

[^2]: [img2](./resources/consensus-results-before-refresh.png)

[^3]: [img3](./resources/consensus-results-after-refresh.png)