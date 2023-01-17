import type {
  ChatConsensusInfo,
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
  selectChatConsensusInfo,
  selectAccountPromptStr,
  selectAccountPromptStrs,
} from '../selectors';
import {
  areSortedArraysEqual, omit, pickTruthy, unique,
} from '../../util/iteratees';

type MessageStoreSections = {
  byId: Record<number, ApiMessage>;
  threadsById: Record<number, Thread>;
  consensusInfo: ChatConsensusInfo;
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
  newConsensusInfo: ChatConsensusInfo,
): GlobalState {
  return updateMessageStore(global, chatId, {
    byId: newById,
    consensusInfo: newConsensusInfo,
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

function addNewMessageAsReplyToPrompt(
  consensusInfo: ChatConsensusInfo,
  msg: ApiMessage,
): ChatConsensusInfo {
  if (msg.replyToMessageId && msg.senderId && msg.content.text?.text) {
    const platform = consensusInfo.extAccountPrompts[msg.replyToMessageId];
    if (platform) {
      const prevInfo = consensusInfo;
      const [oldEntryDate] = prevInfo.extAccounts[platform][msg.senderId];
      if (oldEntryDate && oldEntryDate <= msg.date) {
        consensusInfo = {
          ...prevInfo,
          extAccounts: {
            ...prevInfo.extAccounts,
            [platform]: {
              ...prevInfo.extAccounts[platform],
              [msg.senderId]: [msg.date, msg.content.text.text],
            },
          },
        };
      }
    }
  }

  return consensusInfo;
}

function addNewMessageForConsensus(
  global: GlobalState,
  currentById: Record<number, ApiMessage>,
  consensusInfo: ChatConsensusInfo,
  msg: ApiMessage,
) {
  const prevConsensusInfo = consensusInfo;
  consensusInfo = addNewMessageAsReplyToPrompt(consensusInfo, msg);
  if (prevConsensusInfo !== consensusInfo && msg.content.poll) {
    // rankings poll
    const regResult = rankPollRe.match(msg.content.poll.summary.question);
    if (regResult) {
      const rank = parseInt(regResult[1], 10) as Rank;
      const [date] = consensusInfo.latestRankingPolls[rank];
      if (date && date <= msg.date) {
        consensusInfo = {
          ...consensusInfo,
          latestRankingPolls: {
            ...consensusInfo.latestRankingPolls,
            [rank]: [msg.date, msg.id],
          },
        };
      }
    } else if (selectDelegateRe.match(msg.content.poll.summary.question)) { // delegate poll
      const date = consensusInfo.latestDelegatePoll && consensusInfo.latestDelegatePoll[0];
      if (date && date <= msg.date) {
        consensusInfo = {
          ...consensusInfo,
          latestDelegatePoll: [msg.date, msg.id],
        };
      }
    }
  } else {
    // Check if it is account prompt message
    Object.entries(selectAccountPromptStrs(global)).forEach(([platform, str]) => {
      if (msg.content.text && msg.content.text.text === str) {
        const prevInfo = consensusInfo;
        consensusInfo = {
          ...prevInfo,
          extAccountPrompts: {
            [msg.id]: platform,
          },
        };
        // Check for existing replies to this prompt
        Object.values(currentById).forEach((existingMsg) => {
          consensusInfo = addNewMessageAsReplyToPrompt(consensusInfo, existingMsg);
        });
      }
    });
  }

  return consensusInfo;
}

export function addChatMessagesById(
  global: GlobalState, chatId: string, newById: Record<number, ApiMessage>,
): GlobalState {
  const byId = selectChatMessages(global, chatId);

  if (byId && Object.keys(newById).every((newId) => Boolean(byId[Number(newId)]))) {
    return global;
  }

  let consensusInfo: ChatConsensusInfo = selectChatConsensusInfo(global, chatId);
  let currentById = { ...byId };
  Object.values(newById).forEach((msg) => {
    currentById = { ...currentById, [msg.id]: msg };
    consensusInfo = addNewMessageForConsensus(global, currentById, consensusInfo, msg);
  });

  return replaceChatMessages(global, chatId, {
    ...newById,
    ...byId,
  }, consensusInfo);
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

  let consensusInfo = selectChatConsensusInfo(global, chatId);
  const promptPlatform = consensusInfo.extAccountPrompts[messageId];
  if (promptPlatform) {
    const promptStr = selectAccountPromptStr(global, promptPlatform);
    if (updatedMessage.content.text?.text !== promptStr) {
      // Ignoring this updated message (even if it is a valid consensus message) from now on
      // because part of replies to it might be intended for another platform
      delete consensusInfo.extAccountPrompts[messageId];
    }
  } else if (message.replyToMessageId && message.senderId && message.content.text?.text) {
    const platform = consensusInfo.extAccountPrompts[message.replyToMessageId];
    if (platform) {
      const [date, acc] = consensusInfo.extAccounts[platform][message.senderId];
      if (message.date === date && message.content.text.text === acc) {
        delete consensusInfo.extAccounts[platform][message.senderId];
        consensusInfo = addNewMessageForConsensus(global, byId, consensusInfo, updatedMessage);
      }
    }
  } else if (message.content.poll) {
    // handle when poll question changes
    const oldQuestion = message.content.poll?.summary.question;
    const newQuestion = updatedMessage.content.poll?.summary.question;
    if (oldQuestion !== newQuestion) {
      const regResult = rankPollRe.match(oldQuestion);
      if (regResult) {
        const rank = parseInt(regResult[1], 10) as Rank;
        const id = consensusInfo.latestRankingPolls[rank][1];
        if (id === messageId) {
          delete consensusInfo.latestRankingPolls[rank];
          consensusInfo = addNewMessageForConsensus(global, byId, consensusInfo, updatedMessage);
        }
      } else if (selectDelegateRe.match(oldQuestion)) {
        const id = consensusInfo.latestDelegatePoll && consensusInfo.latestDelegatePoll[1];
        if (id === messageId) {
          consensusInfo.latestDelegatePoll = undefined;
          // TODO:
          // Object.values(newById).forEach((msg) => {
          //   // Run only adding delegates...

          // });
        }
      }
    }
  } else {
    // handle when old message wasn't consensus message but updated is
    consensusInfo = addNewMessageForConsensus(global, byId, consensusInfo, updatedMessage);
  }

  return replaceChatMessages(global, chatId, newById, consensusInfo);
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

  global = replaceChatMessages(global, chatId, newById, selectChatConsensusInfo(global, chatId));

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
