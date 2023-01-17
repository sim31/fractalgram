import type {
  ChatConsensusMessages,
  GlobalState, MessageList, MessageListType, Rank, Thread,
} from '../types';
import { rankPollRe, selectDelegateRe } from '../types';
import type { ApiMessage, ApiSponsoredMessage, ApiThreadInfo } from '../../api/types';
import { MAIN_THREAD_ID } from '../../api/types';
import type { FocusDirection } from '../../types';

import {
  IS_MOCKED_CLIENT,
  IS_TEST, MESSAGE_LIST_SLICE, MESSAGE_LIST_VIEWPORT_LIMIT, TMP_CHAT_ID,
} from '../../config';
import {
  selectListedIds,
  selectChatMessages,
  selectViewportIds,
  selectOutlyingIds,
  selectPinnedIds,
  selectThreadInfo,
  selectMessageIdsByGroupId,
  selectScheduledMessages,
  selectScheduledIds,
  selectCurrentMessageIds,
  selectChatMessage,
  selectCurrentMessageList,
  selectChatConsensusMsgs,
  selectAccountPromptStr,
  selectAccountPromptStrs,
} from '../selectors';
import {
  areSortedArraysEqual, omit, pickTruthy, unique,
} from '../../util/iteratees';

type MessageStoreSections = {
  byId: Record<number, ApiMessage>;
  threadsById: Record<number, Thread>;
  consensusMsgs: ChatConsensusMessages;
};

export function updateCurrentMessageList(
  global: GlobalState,
  chatId: string | undefined,
  threadId: number = MAIN_THREAD_ID,
  type: MessageListType = 'thread',
  shouldReplaceHistory?: boolean,
): GlobalState {
  const { messageLists } = global.messages;
  let newMessageLists: MessageList[] = messageLists;
  if (shouldReplaceHistory || (IS_TEST && !IS_MOCKED_CLIENT)) {
    newMessageLists = chatId ? [{ chatId, threadId, type }] : [];
  } else if (chatId) {
    const last = messageLists[messageLists.length - 1];
    if (!last || last.chatId !== chatId || last.threadId !== threadId || last.type !== type) {
      if (last && last.chatId === TMP_CHAT_ID) {
        newMessageLists = [...messageLists.slice(0, -1), { chatId, threadId, type }];
      } else {
        newMessageLists = [...messageLists, { chatId, threadId, type }];
      }
    }
  } else {
    newMessageLists = messageLists.slice(0, -1);
  }

  return {
    ...global,
    messages: {
      ...global.messages,
      messageLists: newMessageLists,
    },
  };
}

function replaceChatMessages(
  global: GlobalState,
  chatId: string,
  newById: Record<number, ApiMessage>,
  newConsensusMsgs: ChatConsensusMessages,
): GlobalState {
  return updateMessageStore(global, chatId, {
    byId: newById,
    consensusMsgs: newConsensusMsgs,
  });
}

export function updateThread(
  global: GlobalState, chatId: string, threadId: number, threadUpdate: Partial<Thread>,
): GlobalState {
  const current = global.messages.byChatId[chatId];

  return updateMessageStore(global, chatId, {
    threadsById: {
      ...(current?.threadsById),
      [threadId]: {
        ...(current?.threadsById[threadId]),
        ...threadUpdate,
      },
    },
  });
}

function updateMessageStore(
  global: GlobalState, chatId: string, update: Partial<MessageStoreSections>,
): GlobalState {
  const current = global.messages.byChatId[chatId] || { byId: {}, threadsById: {} };

  return {
    ...global,
    messages: {
      ...global.messages,
      byChatId: {
        ...global.messages.byChatId,
        [chatId]: {
          ...current,
          ...update,
        },
      },
    },
  };
}

export function replaceThreadParam<T extends keyof Thread>(
  global: GlobalState, chatId: string, threadId: number, paramName: T, newValue: Thread[T] | undefined,
) {
  return updateThread(global, chatId, threadId, { [paramName]: newValue });
}

export function addMessages(
  global: GlobalState, messages: ApiMessage[],
): GlobalState {
  const addedByChatId = messages.reduce((messagesByChatId, message: ApiMessage) => {
    if (!messagesByChatId[message.chatId]) {
      messagesByChatId[message.chatId] = {};
    }
    messagesByChatId[message.chatId][message.id] = message;

    return messagesByChatId;
  }, {} as Record<string, Record<number, ApiMessage>>);

  Object.keys(addedByChatId).forEach((chatId) => {
    global = addChatMessagesById(global, chatId, addedByChatId[chatId]);
  });

  return global;
}

function updatePromptReplies(
  consensusMsgs: ChatConsensusMessages,
  msg: ApiMessage,
): ChatConsensusMessages {
  if (msg.replyToMessageId && msg.senderId && msg.content.text?.text) {
    const platform = consensusMsgs.extAccountPrompts[msg.replyToMessageId];
    if (platform) {
      const replies = consensusMsgs.extAccountReplies[platform];
      consensusMsgs = {
        ...consensusMsgs,
        extAccountReplies: {
          ...consensusMsgs.extAccountReplies,
          [platform]: replies ? new Set([...replies, msg.id]) : new Set([msg.id]),
        },
      };
    }
  }

  return consensusMsgs;
}

function updateConsensusMessages(
  global: GlobalState,
  currentById: Record<number, ApiMessage>,
  consensusMsgs: ChatConsensusMessages,
  msg: ApiMessage,
) {
  const prevConsensusInfo = consensusMsgs;
  consensusMsgs = updatePromptReplies(consensusMsgs, msg);
  if (prevConsensusInfo === consensusMsgs && msg.content.poll) {
    // rankings poll
    const regResult = rankPollRe.match(msg.content.poll.summary.question);
    if (regResult) {
      const rank = parseInt(regResult[1], 10);
      const rankPolls = consensusMsgs.rankingPolls[rank];
      consensusMsgs = {
        ...consensusMsgs,
        rankingPolls: {
          ...consensusMsgs.rankingPolls,
          [rank]: rankPolls ? new Set([...rankPolls, msg.id]) : new Set([msg.id]),
        },
      };
    } else if (selectDelegateRe.match(msg.content.poll.summary.question)) { // delegate poll
      consensusMsgs = {
        ...consensusMsgs,
        delegatePolls: new Set([...consensusMsgs.delegatePolls, msg.id]),
      };
    }
  } else {
    // Check if it is account prompt message
    Object.entries(selectAccountPromptStrs(global)).forEach(([platform, str]) => {
      if (msg.content.text && msg.content.text.text === str) {
        consensusMsgs = {
          ...consensusMsgs,
          extAccountPrompts: {
            [msg.id]: platform,
          },
        };
        // Check for existing replies to this prompt
        Object.values(currentById).forEach((existingMsg) => {
          consensusMsgs = updatePromptReplies(consensusMsgs, existingMsg);
        });
      }
    });
  }

  return consensusMsgs;
}

export function addChatMessagesById(
  global: GlobalState, chatId: string, newById: Record<number, ApiMessage>,
): GlobalState {
  const byId = selectChatMessages(global, chatId);

  if (byId && Object.keys(newById).every((newId) => Boolean(byId[Number(newId)]))) {
    return global;
  }

  let consensusMsgs: ChatConsensusMessages = selectChatConsensusMsgs(global, chatId);
  const currentById = { ...byId };
  Object.values(newById).forEach((msg) => {
    consensusMsgs = updateConsensusMessages(global, currentById, consensusMsgs, msg);
    currentById[msg.id] = msg;
  });

  return replaceChatMessages(global, chatId, {
    ...newById,
    ...byId,
  }, consensusMsgs);
}

export function updateChatMessage(
  global: GlobalState, chatId: string, messageId: number, messageUpdate: Partial<ApiMessage>,
): GlobalState {
  const byId = selectChatMessages(global, chatId) || {};
  const message = byId[messageId];
  const updatedMessage = {
    ...message,
    ...messageUpdate,
  };

  if (!updatedMessage.id) {
    return global;
  }

  const newById = {
    ...byId,
    [messageId]: updatedMessage,
  };

  // eslint-disable-next-line no-console
  console.assert(updatedMessage.id === messageId);

  // TODO: cases to handle
  // * Was a prompt and is not anymore
  // * Was a reply and is not anymore
  // * Was a poll and is not anymore
  // * Was not a prompt, but is now
  // * Was not a reply but is now
  // * Was not a poll but is now
  // * Was a promt for one platform, now it is for another
  // * Was a reply for one platform, now for another
  // * Was a poll for one rank, now for another
  // So to handle:
  // * old prompt: check the message does not match the old prompt (platform). If so then just delete it
  // * old reply: check if replyingToMsgId did not change. If it did remove the reply.
  // * old poll: check if question did not change. If it did remove this poll.
  // Run the updated message through adding new consensus message - it won't duplicate anything and might detect new consensus message
  let consensusMsgs = selectChatConsensusMsgs(global, chatId);
  let update: boolean = true;
  const promptPlatform = consensusMsgs.extAccountPrompts[messageId];
  if (promptPlatform) {
    const promptStr = selectAccountPromptStr(global, promptPlatform);
    if (updatedMessage.content.text?.text !== promptStr) {
      consensusMsgs = {
        ...consensusMsgs,
        extAccountPrompts: { ...consensusMsgs.extAccountPrompts },
      };
      delete consensusMsgs.extAccountPrompts[messageId];
    } else {
      update = false;
    }
  } else if (message.replyToMessageId && message.senderId && message.content.text?.text) {
    if (message.replyToMessageId !== updatedMessage.replyToMessageId) {
      const platform = consensusMsgs.extAccountPrompts[message.replyToMessageId];
      if (platform) {
        consensusMsgs = {
          ...consensusMsgs,
          extAccountReplies: { ...consensusMsgs.extAccountReplies },
        };
        consensusMsgs.extAccountReplies[platform].delete(messageId);
      }
    } else {
      update = false;
    }
  } else if (message.content.poll) {
    // handle when poll question changes
    const oldQuestion = message.content.poll?.summary.question;
    const newQuestion = updatedMessage.content.poll?.summary.question;
    if (oldQuestion !== newQuestion) {
      const regResult = rankPollRe.match(oldQuestion);
      if (regResult) {
        const rank = parseInt(regResult[1], 10) as Rank;
        let polls = consensusMsgs.rankingPolls[rank];
        if (polls) {
          polls = new Set(polls);
          polls.delete(messageId);
          consensusMsgs = {
            ...consensusMsgs,
            rankingPolls: {
              ...consensusMsgs.rankingPolls,
              [rank]: polls,
            },
          };
        }
      } else if (selectDelegateRe.match(oldQuestion)) {
        const polls = new Set(consensusMsgs.delegatePolls);
        polls.delete(messageId);
        consensusMsgs = {
          ...consensusMsgs,
          delegatePolls: polls,
        };
      }
    } else {
      update = false;
    }
  }

  if (update) {
    consensusMsgs = updateConsensusMessages(global, byId, consensusMsgs, updatedMessage);
  }

  return replaceChatMessages(global, chatId, newById, consensusMsgs);
}

export function updateScheduledMessage(
  global: GlobalState, chatId: string, messageId: number, messageUpdate: Partial<ApiMessage>,
): GlobalState {
  const byId = selectScheduledMessages(global, chatId) || {};
  const message = byId[messageId];
  const updatedMessage = {
    ...message,
    ...messageUpdate,
  };

  if (!updatedMessage.id) {
    return global;
  }

  return replaceScheduledMessages(global, chatId, {
    ...byId,
    [messageId]: updatedMessage,
  });
}

function deleteConsensusMessages(
  consensusMsgs: ChatConsensusMessages,
  messageIds: number[],
) {
  Object.values(messageIds).forEach((msgId) => {
    if (consensusMsgs.extAccountPrompts[msgId]) {
      consensusMsgs = { ...consensusMsgs };
      delete consensusMsgs.extAccountPrompts[msgId];
    } else if (consensusMsgs.delegatePolls.has(msgId)) {
      consensusMsgs = { ...consensusMsgs };
      consensusMsgs.delegatePolls.delete(msgId);
    } else {
      let newExtAccountReplies = consensusMsgs.extAccountReplies;
      Object.entries(consensusMsgs.extAccountReplies).forEach(([platform, replies]) => {
        if (replies.has(msgId)) {
          const newReplies = new Set(replies);
          newReplies.delete(msgId);
          newExtAccountReplies = {
            ...newExtAccountReplies,
            [platform]: newReplies,
          };
        }
      });
      let newRankingPolls = consensusMsgs.rankingPolls;
      Object.entries(consensusMsgs.rankingPolls).forEach(([rank, polls]) => {
        if (polls.has(msgId)) {
          const newPolls = new Set(polls);
          newPolls.delete(msgId);
          newRankingPolls = {
            ...newRankingPolls,
            [rank]: newPolls,
          };
        }
      });

      if (newExtAccountReplies !== consensusMsgs.extAccountReplies || newRankingPolls !== consensusMsgs.rankingPolls) {
        consensusMsgs = {
          ...consensusMsgs,
          extAccountReplies: newExtAccountReplies,
          rankingPolls: newRankingPolls,
        };
      }
    }
  });

  return consensusMsgs;
}

export function deleteChatMessages(
  global: GlobalState,
  chatId: string,
  messageIds: number[],
): GlobalState {
  const byId = selectChatMessages(global, chatId);
  if (!byId) {
    return global;
  }
  const newById = omit(byId, messageIds);
  const deletedForwardedPosts = Object.values(pickTruthy(byId, messageIds)).filter(
    ({ forwardInfo }) => forwardInfo?.isLinkedChannelPost,
  );

  const threadIds = Object.keys(global.messages.byChatId[chatId].threadsById).map(Number);
  threadIds.forEach((threadId) => {
    const threadInfo = selectThreadInfo(global, chatId, threadId);

    let listedIds = selectListedIds(global, chatId, threadId);
    let outlyingIds = selectOutlyingIds(global, chatId, threadId);
    let viewportIds = selectViewportIds(global, chatId, threadId);
    let pinnedIds = selectPinnedIds(global, chatId);
    let newMessageCount = threadInfo?.messagesCount;

    messageIds.forEach((messageId) => {
      if (listedIds && listedIds.includes(messageId)) {
        listedIds = listedIds.filter((id) => id !== messageId);
        if (newMessageCount !== undefined) newMessageCount -= 1;
      }

      if (outlyingIds && outlyingIds.includes(messageId)) {
        outlyingIds = outlyingIds.filter((id) => id !== messageId);
      }

      if (viewportIds && viewportIds.includes(messageId)) {
        viewportIds = viewportIds.filter((id) => id !== messageId);
      }

      if (pinnedIds && pinnedIds.includes(messageId)) {
        pinnedIds = pinnedIds.filter((id) => id !== messageId);
      }
    });

    global = replaceThreadParam(global, chatId, threadId, 'listedIds', listedIds);
    global = replaceThreadParam(global, chatId, threadId, 'outlyingIds', outlyingIds);
    global = replaceThreadParam(global, chatId, threadId, 'viewportIds', viewportIds);
    global = replaceThreadParam(global, chatId, threadId, 'pinnedIds', pinnedIds);

    if (threadInfo && newMessageCount !== undefined) {
      global = replaceThreadParam(global, chatId, threadId, 'threadInfo', {
        ...threadInfo,
        messagesCount: newMessageCount,
      });
    }
  });

  if (deletedForwardedPosts.length) {
    const currentMessageList = selectCurrentMessageList(global);
    const canDeleteCurrentThread = currentMessageList && currentMessageList.chatId === chatId
      && currentMessageList.type === 'thread';
    const currentThreadId = currentMessageList?.threadId;

    deletedForwardedPosts.forEach((message) => {
      const { fromChatId, fromMessageId } = message.forwardInfo!;
      const originalPost = selectChatMessage(global, fromChatId!, fromMessageId!);

      if (canDeleteCurrentThread && currentThreadId === fromMessageId) {
        global = updateCurrentMessageList(global, chatId);
      }
      if (originalPost) {
        global = updateChatMessage(global, fromChatId!, fromMessageId!, { threadInfo: undefined });
      }
    });
  }

  let consensusMsgs = selectChatConsensusMsgs(global, chatId);
  consensusMsgs = deleteConsensusMessages(consensusMsgs, messageIds);

  global = replaceChatMessages(global, chatId, newById, consensusMsgs);

  return global;
}

export function deleteChatScheduledMessages(
  global: GlobalState,
  chatId: string,
  messageIds: number[],
): GlobalState {
  const byId = selectScheduledMessages(global, chatId);
  if (!byId) {
    return global;
  }
  const newById = omit(byId, messageIds);

  let scheduledIds = selectScheduledIds(global, chatId);
  if (scheduledIds) {
    messageIds.forEach((messageId) => {
      if (scheduledIds!.includes(messageId)) {
        scheduledIds = scheduledIds!.filter((id) => id !== messageId);
      }
    });
    global = replaceThreadParam(global, chatId, MAIN_THREAD_ID, 'scheduledIds', scheduledIds);
  }

  global = replaceScheduledMessages(global, chatId, newById);

  return global;
}

export function updateListedIds(
  global: GlobalState,
  chatId: string,
  threadId: number,
  idsUpdate: number[],
): GlobalState {
  const listedIds = selectListedIds(global, chatId, threadId);
  const newIds = listedIds?.length
    ? idsUpdate.filter((id) => !listedIds.includes(id))
    : idsUpdate;

  if (listedIds && !newIds.length) {
    return global;
  }

  return replaceThreadParam(global, chatId, threadId, 'listedIds', orderHistoryIds([
    ...(listedIds || []),
    ...newIds,
  ]));
}

export function updateOutlyingIds(
  global: GlobalState,
  chatId: string,
  threadId: number,
  idsUpdate: number[],
): GlobalState {
  const outlyingIds = selectOutlyingIds(global, chatId, threadId);
  const newIds = outlyingIds?.length
    ? idsUpdate.filter((id) => !outlyingIds.includes(id))
    : idsUpdate;

  if (outlyingIds && !newIds.length) {
    return global;
  }

  return replaceThreadParam(global, chatId, threadId, 'outlyingIds', orderHistoryIds([
    ...(outlyingIds || []),
    ...newIds,
  ]));
}

function orderHistoryIds(listedIds: number[]) {
  return listedIds.sort((a, b) => a - b);
}

export function addViewportId(
  global: GlobalState,
  chatId: string,
  threadId: number,
  newId: number,
): GlobalState {
  const viewportIds = selectViewportIds(global, chatId, threadId) || [];
  if (viewportIds.includes(newId)) {
    return global;
  }

  const newIds = orderHistoryIds([
    ...(
      viewportIds.length < MESSAGE_LIST_VIEWPORT_LIMIT
        ? viewportIds
        : viewportIds.slice(-(MESSAGE_LIST_SLICE / 2))
    ),
    newId,
  ]);

  return replaceThreadParam(global, chatId, threadId, 'viewportIds', newIds);
}

export function safeReplaceViewportIds(
  global: GlobalState,
  chatId: string,
  threadId: number,
  newViewportIds: number[],
): GlobalState {
  const currentIds = selectViewportIds(global, chatId, threadId) || [];
  const newIds = orderHistoryIds(newViewportIds);

  return replaceThreadParam(
    global,
    chatId,
    threadId,
    'viewportIds',
    areSortedArraysEqual(currentIds, newIds) ? currentIds : newIds,
  );
}

export function updateThreadInfo(
  global: GlobalState, chatId: string, threadId: number, update: Partial<ApiThreadInfo> | undefined,
): GlobalState {
  const newThreadInfo = {
    ...(selectThreadInfo(global, chatId, threadId) as ApiThreadInfo),
    ...update,
  };

  if (!newThreadInfo.threadId) {
    return global;
  }

  return replaceThreadParam(global, chatId, threadId, 'threadInfo', newThreadInfo);
}

export function updateThreadInfos(
  global: GlobalState, chatId: string, updates: Partial<ApiThreadInfo>[],
): GlobalState {
  updates.forEach((update) => {
    global = updateThreadInfo(global, update.chatId!, update.threadId!, update);
  });

  return global;
}

export function replaceScheduledMessages(
  global: GlobalState, chatId: string, newById: Record<number, ApiMessage>,
): GlobalState {
  return updateScheduledMessages(global, chatId, {
    byId: newById,
  });
}

function updateScheduledMessages(
  global: GlobalState, chatId: string, update: Partial<{ byId: Record<number, ApiMessage> }>,
): GlobalState {
  const current = global.scheduledMessages.byChatId[chatId] || { byId: {}, hash: 0 };

  return {
    ...global,
    scheduledMessages: {
      byChatId: {
        ...global.scheduledMessages.byChatId,
        [chatId]: {
          ...current,
          ...update,
        },
      },
    },
  };
}

export function updateFocusedMessage(
  global: GlobalState, chatId?: string, messageId?: number, noHighlight = false, isResizingContainer = false,
): GlobalState {
  return {
    ...global,
    focusedMessage: {
      ...global.focusedMessage,
      chatId,
      messageId,
      noHighlight,
      isResizingContainer,
    },
  };
}

export function updateSponsoredMessage(
  global: GlobalState, chatId: string, message: ApiSponsoredMessage,
): GlobalState {
  return {
    ...global,
    messages: {
      ...global.messages,
      sponsoredByChatId: {
        ...global.messages.sponsoredByChatId,
        [chatId]: message,
      },
    },
  };
}

export function updateFocusDirection(
  global: GlobalState, direction?: FocusDirection,
): GlobalState {
  return {
    ...global,
    focusedMessage: {
      ...global.focusedMessage,
      direction,
    },
  };
}

export function enterMessageSelectMode(
  global: GlobalState,
  chatId: string,
  messageId?: number | number[],
): GlobalState {
  const messageIds = messageId ? Array.prototype.concat([], messageId) : [];
  return {
    ...global,
    selectedMessages: {
      chatId,
      messageIds,
    },
  };
}

export function toggleMessageSelection(
  global: GlobalState,
  chatId: string,
  threadId: number,
  messageListType: MessageListType,
  messageId: number,
  groupedId?: string,
  childMessageIds?: number[],
  withShift = false,
): GlobalState {
  const { selectedMessages: oldSelectedMessages } = global;
  if (groupedId) {
    childMessageIds = selectMessageIdsByGroupId(global, chatId, groupedId);
  }
  const selectedMessageIds = childMessageIds || [messageId];
  if (!oldSelectedMessages) {
    return enterMessageSelectMode(global, chatId, selectedMessageIds);
  }

  const { messageIds } = oldSelectedMessages;

  let newMessageIds;
  const newSelectedMessageIds = selectedMessageIds.filter((id) => !messageIds.includes(id));
  if (newSelectedMessageIds && !newSelectedMessageIds.length) {
    newMessageIds = messageIds.filter((id) => !selectedMessageIds.includes(id));
  } else if (withShift && messageIds.length) {
    const viewportIds = selectCurrentMessageIds(global, chatId, threadId, messageListType)!;
    const prevIndex = viewportIds.indexOf(messageIds[messageIds.length - 1]);
    const currentIndex = viewportIds.indexOf(messageId);
    const from = Math.min(prevIndex, currentIndex);
    const to = Math.max(prevIndex, currentIndex);
    const slice = viewportIds.slice(from, to + 1);
    newMessageIds = unique([...messageIds, ...slice]);
  } else {
    newMessageIds = [...messageIds, ...newSelectedMessageIds];
  }

  if (!newMessageIds.length) {
    return exitMessageSelectMode(global);
  }

  return {
    ...global,
    selectedMessages: {
      ...oldSelectedMessages,
      messageIds: newMessageIds,
    },
  };
}

export function exitMessageSelectMode(global: GlobalState): GlobalState {
  return {
    ...global,
    selectedMessages: undefined,
  };
}

export function updateThreadUnreadFromForwardedMessage(
  global: GlobalState,
  originMessage: ApiMessage,
  chatId: string,
  lastMessageId: number,
  isDeleting?: boolean,
) {
  const { channelPostId, fromChatId } = originMessage.forwardInfo || {};
  if (channelPostId && fromChatId) {
    const threadInfoOld = selectThreadInfo(global, chatId, channelPostId);
    if (threadInfoOld) {
      global = replaceThreadParam(global, chatId, channelPostId, 'threadInfo', {
        ...threadInfoOld,
        lastMessageId,
        messagesCount: threadInfoOld.messagesCount + (isDeleting ? -1 : 1),
      });
    }
  }
  return global;
}
