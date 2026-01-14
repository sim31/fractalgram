import type { ApiChat, ApiMessage, ApiPoll } from '../../../api/types';
import type { Rank } from '../../../config';
import type {
  ActionReturnType,
  GlobalState, TabState
} from '../../types';
import { MAIN_THREAD_ID } from '../../../api/types';
import { 
  type ActiveDownloads, FocusDirection,
  AccountMap, ConsensusResultOption, ConsensusResults,
  ExtPlatformInfo, ExtUser, PollModalDefaults
} from '../../../types';

import {
  ALLOWED_RANKS,
  ANIMATION_END_DELAY,
  DEFAULT_PLATFORM,
  FRACTAL_INFO_BY_PLATFORM,
  RANK_POLL_STRS,
  SELECT_DELEGATE_STR,
  SERVICE_NOTIFICATIONS_USER_ID,
  SCROLL_MAX_DURATION,
} from '../../../config';
import assert from '../../../util/assert';
import { cancelScrollBlockingAnimation, isAnimatingScroll } from '../../../util/animateScroll';
import { IS_TOUCH_ENV } from '../../../util/browser/windowEnvironment';
import { copyHtmlToClipboard } from '../../../util/clipboard';
import { getCurrentTabId } from '../../../util/establishMultitabRole';
import { compact, findLast } from '../../../util/iteratees';
import { getTranslationFn } from '../../../util/localization';
import parseHtmlAsFormattedText from '../../../util/parseHtmlAsFormattedText';
import { getServerTime } from '../../../util/serverTime';
import versionNotification from '../../../versionNotification.txt';
import { prettifyAccountStr, promptStrToPlatform } from '../../helpers/consensusMessages';
import {
  getMediaFilename,
  getMediaFormat,
  getMediaHash,
  getMessageStatefulContent,
  isChatChannel,
} from '../../helpers';
import { getMessageSummaryText } from '../../helpers/messageSummary';
import { addTabStateResetterAction } from '../../helpers/meta';
import { getPeerTitle } from '../../helpers/peers';
import { renderMessageSummaryHtml } from '../../helpers/renderMessageSummaryHtml';
import { addActionHandler, getGlobal, setGlobal } from '../../index';
import {
  addActiveMediaDownload,
  cancelMessageMediaDownload,
  enterMessageSelectMode,
  exitMessageSelectMode,
  replaceTabThreadParam,
  replaceThreadParam,
  toggleMessageSelection,
  updateFocusedMessage,
} from '../../reducers';
import { updateTabState } from '../../reducers/tabs';
import {
  selectAllowedMessageActionsSlow,
  selectCanForwardMessage,
  selectChat,
  selectChatMemberAccountMap,
  selectChatLastMessageId,
  selectChatMessage,
  selectChatMessages,
  selectChatScheduledMessages,
  selectCurrentChat,
  selectCurrentMessageList,
  selectDraft,
  selectForwardedMessageIdsByGroupId,
  selectIsRightColumnShown,
  selectIsViewportNewest,
  selectLatestDelegatePoll,
  selectLatestPrompt,
  selectLatestRankingPoll,
  selectMessageIdsByGroupId,
  selectReplyStack,
  selectRequestedChatTranslationLanguage,
  selectRequestedMessageTranslationLanguage,
  selectSender,
  selectTabState,
  selectThreadInfo,
  selectViewportIds,
  // selectLatestDelegatePoll,
  // selectChatRankingPolls,
  // selectLatestRankingPoll,
} from '../../selectors';
import { loadRemainingMessages } from '../api/messages';
import { selectMessageDownloadableMedia } from '../../selectors/media';
import { getPeerStarsForMessage } from '../api/messages';

import { getIsMobile } from '../../../hooks/useAppLayout';

const FOCUS_DURATION = 1500;
const FOCUS_NO_HIGHLIGHT_DURATION = SCROLL_MAX_DURATION + ANIMATION_END_DELAY;
const POLL_RESULT_OPEN_DELAY_MS = 450;
const VERSION_NOTIFICATION_DURATION = 1000 * 60 * 60 * 24 * 7; // 7 days
const SERVICE_NOTIFICATIONS_MAX_AMOUNT = 1e3;

let blurTimeout: number | undefined;

addActionHandler('setScrollOffset', (global, actions, payload): ActionReturnType => {
  const {
    chatId, threadId, scrollOffset, tabId = getCurrentTabId(),
  } = payload;

  global = replaceThreadParam(global, chatId, threadId, 'lastScrollOffset', scrollOffset);

  return replaceTabThreadParam(global, chatId, threadId, 'scrollOffset', scrollOffset, tabId);
});

addActionHandler('setEditingId', (global, actions, payload): ActionReturnType => {
  const { messageId, tabId = getCurrentTabId() } = payload;
  const currentMessageList = selectCurrentMessageList(global, tabId);
  if (!currentMessageList) {
    return undefined;
  }

  const { chatId, threadId, type } = currentMessageList;
  const paramName = type === 'scheduled' ? 'editingScheduledId' : 'editingId';

  return replaceThreadParam(global, chatId, threadId, paramName, messageId);
});

addActionHandler('setEditingDraft', (global, actions, payload): ActionReturnType => {
  const {
    text, chatId, threadId, type,
  } = payload;

  const paramName = type === 'scheduled' ? 'editingScheduledDraft' : 'editingDraft';

  return replaceThreadParam(global, chatId, threadId, paramName, text);
});

addActionHandler('editLastMessage', (global, actions, payload): ActionReturnType => {
  const { tabId = getCurrentTabId() } = payload || {};
  const { chatId, threadId } = selectCurrentMessageList(global, tabId) || {};
  if (!chatId || !threadId) {
    return undefined;
  }

  const chatMessages = selectChatMessages(global, chatId);
  const viewportIds = selectViewportIds(global, chatId, threadId, tabId);
  if (!chatMessages || !viewportIds) {
    return undefined;
  }

  const lastOwnEditableMessageId = findLast(viewportIds, (id) => {
    return Boolean(chatMessages[id] && selectAllowedMessageActionsSlow(global, chatMessages[id], threadId).canEdit);
  });

  if (!lastOwnEditableMessageId) {
    return undefined;
  }

  return replaceThreadParam(global, chatId, threadId, 'editingId', lastOwnEditableMessageId);
});

addActionHandler('replyToNextMessage', (global, actions, payload): ActionReturnType => {
  const { targetIndexDelta, tabId = getCurrentTabId() } = payload;
  const { chatId, threadId } = selectCurrentMessageList(global, tabId) || {};
  if (!chatId || !threadId) {
    return;
  }

  const chatMessages = selectChatMessages(global, chatId);
  const viewportIds = selectViewportIds(global, chatId, threadId, tabId);
  if (!chatMessages || !viewportIds) {
    return;
  }

  const replyInfo = selectDraft(global, chatId, threadId)?.replyInfo;
  const isLatest = selectIsViewportNewest(global, chatId, threadId, tabId);

  let messageId: number | undefined;

  if (!isLatest || !replyInfo?.replyToMsgId) {
    if (threadId === MAIN_THREAD_ID) {
      messageId = selectChatLastMessageId(global, chatId);
    } else {
      const threadInfo = selectThreadInfo(global, chatId, threadId);

      messageId = threadInfo?.lastMessageId;
    }
  } else {
    const chatMessageKeys = Object.keys(chatMessages);
    const indexOfCurrent = chatMessageKeys.indexOf(replyInfo.replyToMsgId.toString());
    const newIndex = indexOfCurrent + targetIndexDelta;
    messageId = newIndex <= chatMessageKeys.length + 1 && newIndex >= 0
      ? Number(chatMessageKeys[newIndex])
      : undefined;
  }
  actions.updateDraftReplyInfo({
    replyToMsgId: messageId, replyToPeerId: undefined, quoteText: undefined, tabId,
  });
  actions.focusMessage({
    chatId,
    threadId,
    messageId: messageId!,
    tabId,
  });
});

addActionHandler('openAudioPlayer', (global, actions, payload): ActionReturnType => {
  const {
    chatId, threadId, messageId, origin, playbackRate, isMuted, timestamp,
    tabId = getCurrentTabId(),
  } = payload;

  const tabState = selectTabState(global, tabId);
  return updateTabState(global, {
    audioPlayer: {
      chatId,
      threadId,
      messageId,
      timestamp,
      origin: origin ?? tabState.audioPlayer.origin,
      playbackRate: playbackRate || tabState.audioPlayer.playbackRate || global.audioPlayer.lastPlaybackRate,
      isPlaybackRateActive: (tabState.audioPlayer.isPlaybackRateActive === undefined
        ? global.audioPlayer.isLastPlaybackRateActive
        : tabState.audioPlayer.isPlaybackRateActive),
      isMuted: isMuted || tabState.audioPlayer.isMuted,
    },
  }, tabId);
});

addActionHandler('setAudioPlayerVolume', (global, actions, payload): ActionReturnType => {
  const {
    volume, tabId = getCurrentTabId(),
  } = payload;

  global = updateTabState(global, {
    audioPlayer: {
      ...selectTabState(global, tabId).audioPlayer,
      isMuted: false,
    },
  }, tabId);
  global = {
    ...global,
    audioPlayer: {
      ...global.audioPlayer,
      volume,
    },
  };
  return global;
});

addActionHandler('setAudioPlayerPlaybackRate', (global, actions, payload): ActionReturnType => {
  const {
    playbackRate, isPlaybackRateActive, tabId = getCurrentTabId(),
  } = payload;

  global = {
    ...global,
    audioPlayer: {
      ...global.audioPlayer,
      lastPlaybackRate: playbackRate,
      isLastPlaybackRateActive: isPlaybackRateActive,
    },
  };

  return updateTabState(global, {
    audioPlayer: {
      ...selectTabState(global, tabId).audioPlayer,
      playbackRate,
      isPlaybackRateActive,
    },
  }, tabId);
});

addActionHandler('setAudioPlayerMuted', (global, actions, payload): ActionReturnType => {
  const {
    isMuted, tabId = getCurrentTabId(),
  } = payload;

  return updateTabState(global, {
    audioPlayer: {
      ...selectTabState(global, tabId).audioPlayer,
      isMuted,
    },
  }, tabId);
});

addActionHandler('setAudioPlayerOrigin', (global, actions, payload): ActionReturnType => {
  const {
    origin, tabId = getCurrentTabId(),
  } = payload;

  return updateTabState(global, {
    audioPlayer: {
      ...selectTabState(global, tabId).audioPlayer,
      origin,
    },
  }, tabId);
});

addActionHandler('closeAudioPlayer', (global, actions, payload): ActionReturnType => {
  const { tabId = getCurrentTabId() } = payload || {};
  const tabState = selectTabState(global, tabId);
  return updateTabState(global, {
    audioPlayer: {
      playbackRate: tabState.audioPlayer.playbackRate,
      isPlaybackRateActive: tabState.audioPlayer.isPlaybackRateActive,
      isMuted: tabState.audioPlayer.isMuted,
    },
  }, tabId);
});

addActionHandler('openPollResults', (global, actions, payload): ActionReturnType => {
  const { chatId, messageId, tabId = getCurrentTabId() } = payload;

  const shouldOpenInstantly = selectIsRightColumnShown(global, getIsMobile(), tabId);
  const tabState = selectTabState(global, tabId);

  if (!shouldOpenInstantly) {
    window.setTimeout(() => {
      global = getGlobal();

      global = updateTabState(global, {
        pollResults: {
          chatId,
          messageId,
          voters: {},
        },
      }, tabId);
      setGlobal(global);
    }, POLL_RESULT_OPEN_DELAY_MS);
  } else if (chatId !== tabState.pollResults.chatId || messageId !== tabState.pollResults.messageId) {
    return updateTabState(global, {
      pollResults: {
        chatId,
        messageId,
        voters: {},
      },
    }, tabId);
  }

  return undefined;
});

addActionHandler('closePollResults', (global, actions, payload): ActionReturnType => {
  const { tabId = getCurrentTabId() } = payload || {};
  return updateTabState(global, {
    pollResults: {},
  }, tabId);
});

addActionHandler('focusNextReply', (global, actions, payload): ActionReturnType => {
  const { tabId = getCurrentTabId() } = payload || {};
  const currentMessageList = selectCurrentMessageList(global, tabId);
  if (!currentMessageList) {
    return undefined;
  }

  const { chatId, threadId } = currentMessageList;

  const replyStack = selectReplyStack(global, chatId, threadId, tabId);

  if (!replyStack || replyStack.length === 0) {
    actions.scrollMessageListToBottom({ tabId });
  } else {
    const messageId = replyStack.pop();

    global = replaceTabThreadParam(global, chatId, threadId, 'replyStack', [...replyStack], tabId);

    setGlobal(global);

    actions.focusMessage({
      chatId,
      threadId,
      messageId: messageId!,
      tabId,
      noForumTopicPanel: true,
    });
  }

  return undefined;
});

addActionHandler('focusMessage', (global, actions, payload): ActionReturnType => {
  const {
    chatId, threadId = MAIN_THREAD_ID, messageListType = 'thread', noHighlight, groupedId, groupedChatId,
    replyMessageId, isResizingContainer, shouldReplaceHistory, noForumTopicPanel, quote, quoteOffset,
    scrollTargetPosition, timestamp, tabId = getCurrentTabId(),
  } = payload;

  let { messageId } = payload;

  const chat = selectChat(global, chatId);
  if (!chat) {
    actions.showNotification({ message: { key: 'ErrorFocusInaccessibleMessage' }, tabId });
    return undefined;
  }

  const onMessageReady = timestamp
    ? () => actions.openMediaFromTimestamp({
      chatId, threadId, messageId, timestamp, tabId,
    }) : undefined;

  if (groupedId !== undefined) {
    const ids = selectForwardedMessageIdsByGroupId(global, groupedChatId!, groupedId);
    if (ids?.length) {
      ([messageId] = compact(ids));
    }
  }

  const currentMessageList = selectCurrentMessageList(global, tabId);
  const shouldSwitchChat = !currentMessageList || (
    chatId !== currentMessageList.chatId
    || threadId !== currentMessageList.threadId
    || messageListType !== currentMessageList.type
  );

  if (blurTimeout) {
    clearTimeout(blurTimeout);
    blurTimeout = undefined;
  }
  blurTimeout = window.setTimeout(() => {
    global = getGlobal();
    global = updateFocusedMessage(global, undefined, tabId);
    setGlobal(global);
  }, noHighlight ? FOCUS_NO_HIGHLIGHT_DURATION : FOCUS_DURATION);

  global = updateFocusedMessage(global, {
    chatId,
    messageId,
    threadId,
    noHighlight,
    isResizingContainer,
    quote,
    quoteOffset,
    scrollTargetPosition,
    direction: undefined,
  }, tabId);

  if (replyMessageId) {
    const replyStack = selectReplyStack(global, chatId, threadId, tabId) || [];
    global = replaceTabThreadParam(global, chatId, threadId, 'replyStack', [...replyStack, replyMessageId], tabId);
  }

  if (shouldSwitchChat) {
    global = updateFocusedMessage(global, { direction: FocusDirection.Static }, tabId);
  }

  const viewportIds = selectViewportIds(global, chatId, threadId, tabId);
  if (viewportIds && viewportIds.includes(messageId)) {
    setGlobal(global, { forceOnHeavyAnimation: true });
    actions.openThread({
      chatId,
      threadId,
      type: messageListType,
      shouldReplaceHistory,
      noForumTopicPanel,
      tabId,
    });
    onMessageReady?.();
    return undefined;
  }

  if (shouldSwitchChat) {
    global = replaceTabThreadParam(global, chatId, threadId, 'viewportIds', undefined, tabId);
  }

  if (viewportIds && !shouldSwitchChat) {
    const direction = messageId > viewportIds[0] ? FocusDirection.Down : FocusDirection.Up;
    global = updateFocusedMessage(global, { direction }, tabId);
  }

  if (isAnimatingScroll()) {
    cancelScrollBlockingAnimation();
  }

  setGlobal(global, { forceOnHeavyAnimation: true });

  actions.openThread({
    chatId,
    threadId,
    type: messageListType,
    shouldReplaceHistory,
    noForumTopicPanel,
    tabId,
  });
  actions.loadViewportMessages({
    chatId,
    threadId,
    tabId,
    shouldForceRender: true,
    onLoaded: onMessageReady,
  });
  return undefined;
});

addActionHandler('scrollMessageListToBottom', (global, actions, payload): ActionReturnType => {
  const { tabId = getCurrentTabId() } = payload || {};
  const currentMessageList = selectCurrentMessageList(global, tabId);
  if (!currentMessageList) {
    return;
  }

  const { chatId, threadId } = currentMessageList;

  global = updateFocusedMessage(global, {
    chatId,
    threadId,
    messageId: undefined,
    scrollTargetPosition: 'end',
    direction: FocusDirection.Down,
    noHighlight: true,
  }, tabId);

  setGlobal(global, { forceOnHeavyAnimation: true });

  // Reuse part of `focusMessage`
  if (blurTimeout) {
    clearTimeout(blurTimeout);
    blurTimeout = undefined;
  }
  blurTimeout = window.setTimeout(() => {
    global = getGlobal();
    global = updateFocusedMessage(global, undefined, tabId);
    setGlobal(global);
  }, FOCUS_NO_HIGHLIGHT_DURATION);

  if (isAnimatingScroll()) {
    cancelScrollBlockingAnimation();
  }

  const isViewportNewest = selectIsViewportNewest(global, chatId, threadId, tabId);
  if (isViewportNewest) {
    return;
  }

  actions.loadViewportMessages({
    chatId,
    threadId,
    tabId,
    shouldForceRender: true,
    forceLastSlice: true,
  });
});

addActionHandler('setShouldPreventComposerAnimation', (global, actions, payload): ActionReturnType => {
  const { shouldPreventComposerAnimation, tabId = getCurrentTabId() } = payload;
  return updateTabState(global, {
    shouldPreventComposerAnimation,
  }, tabId);
});

addActionHandler('openReplyMenu', (global, actions, payload): ActionReturnType => {
  const {
    fromChatId, messageId, quoteText, quoteOffset, tabId = getCurrentTabId(),
  } = payload;
  return updateTabState(global, {
    replyingMessage: {
      fromChatId,
      messageId,
      quoteText,
      quoteOffset,
    },
    isShareMessageModalShown: true,
  }, tabId);
});

addActionHandler('openForwardMenu', (global, actions, payload): ActionReturnType => {
  const {
    fromChatId, messageIds, storyId, groupedId, withMyScore, tabId = getCurrentTabId(),
  } = payload;
  let groupedMessageIds;
  if (groupedId) {
    groupedMessageIds = selectMessageIdsByGroupId(global, fromChatId, groupedId);
  }
  return updateTabState(global, {
    forwardMessages: {
      fromChatId,
      messageIds: groupedMessageIds || messageIds,
      storyId,
      withMyScore,
    },
    isShareMessageModalShown: true,
  }, tabId);
});

addActionHandler('changeRecipient', (global, actions, payload): ActionReturnType => {
  const { tabId = getCurrentTabId() } = payload || {};
  return updateTabState(global, {
    forwardMessages: {
      ...selectTabState(global, tabId).forwardMessages,
      toChatId: undefined,
      noAuthors: false,
      noCaptions: false,
    },
    isShareMessageModalShown: true,
  }, tabId);
});

addActionHandler('setForwardNoAuthors', (global, actions, payload): ActionReturnType => {
  const { noAuthors, tabId = getCurrentTabId() } = payload;
  const tabState = selectTabState(global, tabId);
  return updateTabState(global, {
    forwardMessages: {
      ...tabState.forwardMessages,
      noAuthors,
      // `noCaptions` cannot be true when `noAuthors` is false
      noCaptions: noAuthors && tabState.forwardMessages.noCaptions,
    },
  }, tabId);
});

addActionHandler('setForwardNoCaptions', (global, actions, payload): ActionReturnType => {
  const { noCaptions, tabId = getCurrentTabId() } = payload;
  return updateTabState(global, {
    forwardMessages: {
      ...selectTabState(global, tabId).forwardMessages,
      noCaptions,
      noAuthors: noCaptions, // On other clients `noAuthors` updates together with `noCaptions`
    },
  }, tabId);
});

addActionHandler('exitForwardMode', (global, actions, payload): ActionReturnType => {
  const { tabId = getCurrentTabId() } = payload || {};

  global = updateTabState(global, {
    isShareMessageModalShown: false,
    forwardMessages: {},
    replyingMessage: {},
  }, tabId);
  setGlobal(global);
});

addActionHandler('openForwardMenuForSelectedMessages', (global, actions, payload): ActionReturnType => {
  const { tabId = getCurrentTabId() } = payload || {};
  const tabState = selectTabState(global, tabId);
  if (!tabState.selectedMessages) {
    return;
  }

  const { chatId: fromChatId, messageIds } = tabState.selectedMessages;

  const forwardableMessageIds = messageIds.filter((id) => {
    const message = selectChatMessage(global, fromChatId, id);
    return message && selectCanForwardMessage(global, message);
  });

  if (!forwardableMessageIds.length) {
    return;
  }

  actions.openForwardMenu({ fromChatId, messageIds: forwardableMessageIds, tabId });
});

addActionHandler('cancelMediaDownload', (global, actions, payload): ActionReturnType => {
  const { media, tabId = getCurrentTabId() } = payload;

  const hash = getMediaHash(media, 'download');
  if (!hash) return undefined;

  global = cancelMessageMediaDownload(global, [hash], tabId);
  return global;
});

addActionHandler('cancelMediaHashDownloads', (global, actions, payload): ActionReturnType => {
  const { mediaHashes, tabId = getCurrentTabId() } = payload;

  global = cancelMessageMediaDownload(global, mediaHashes, tabId);

  return global;
});

addActionHandler('downloadMedia', (global, actions, payload): ActionReturnType => {
  const { media, originMessage, tabId = getCurrentTabId() } = payload;

  const hash = getMediaHash(media, 'download');
  if (!hash) return undefined;

  const size = 'size' in media ? media.size : 0;
  const metadata = {
    size,
    format: getMediaFormat(media, 'download'),
    filename: getMediaFilename(media),
    originChatId: originMessage?.chatId,
    originMessageId: originMessage?.id,
  } satisfies ActiveDownloads[string];

  return addActiveMediaDownload(global, hash, metadata, tabId);
});

addActionHandler('downloadSelectedMessages', (global, actions, payload): ActionReturnType => {
  const { tabId = getCurrentTabId() } = payload || {};
  const tabState = selectTabState(global, tabId);
  if (!tabState.selectedMessages) {
    return;
  }

  const { chatId, messageIds } = tabState.selectedMessages;
  const { threadId } = selectCurrentMessageList(global, tabId) || {};

  const chatMessages = selectChatMessages(global, chatId);
  if (!chatMessages || !threadId) return;
  const messages = messageIds.map((id) => chatMessages[id])
    .filter((message) => selectAllowedMessageActionsSlow(global, message, threadId).canDownload);
  messages.forEach((message) => {
    const media = selectMessageDownloadableMedia(global, message);
    if (!media) return;
    actions.downloadMedia({ media, originMessage: message, tabId });
  });
});

addActionHandler('enterMessageSelectMode', (global, actions, payload): ActionReturnType => {
  const { messageId, tabId = getCurrentTabId() } = payload || {};
  const openChat = selectCurrentChat(global, tabId);
  if (!openChat) {
    return global;
  }

  return enterMessageSelectMode(global, openChat.id, messageId, tabId);
});

addActionHandler('toggleMessageSelection', (global, actions, payload): ActionReturnType => {
  const {
    messageId,
    groupedId,
    childMessageIds,
    withShift,
    tabId = getCurrentTabId(),
  } = payload;
  const currentMessageList = selectCurrentMessageList(global, tabId);
  if (!currentMessageList) {
    return;
  }

  const { chatId, threadId, type: messageListType } = currentMessageList;

  global = toggleMessageSelection(
    global, chatId, threadId, messageListType, messageId, groupedId, childMessageIds, withShift, tabId,
  );

  setGlobal(global);

  if (global.shouldShowContextMenuHint) {
    actions.disableContextMenuHint();
    actions.showNotification({
      message: {
        key: IS_TOUCH_ENV ? 'ContextMenuHintTouch' : 'ContextMenuHintMouse',
      },
      tabId,
    });
  }
});

addActionHandler('disableContextMenuHint', (global): ActionReturnType => {
  if (!global.shouldShowContextMenuHint) {
    return undefined;
  }

  return {
    ...global,
    shouldShowContextMenuHint: false,
  };
});

addActionHandler('exitMessageSelectMode', (global, actions, payload): ActionReturnType => {
  const { tabId = getCurrentTabId() } = payload || {};
  return exitMessageSelectMode(global, tabId);
});

function openPollModal(
  global: GlobalState,
  tabId: number,
  isQuiz?: boolean,
  defaultValues?: PollModalDefaults,
  consensusResults?: ConsensusResults,
): GlobalState {
  return updateTabState(global, {
    pollModal: {
      isOpen: true,
      isQuiz,
      defaultValues,
      consensusResults,
    },
  }, tabId);
}

function openAccountPromptModal(
  global: GlobalState, platform: string, tabId: number,
): GlobalState {
  return updateTabState(global, {
    accountPromptModal: {
      isOpen: true,
      defaultValues: { platform },
    },
  }, tabId);
}

function closeAccountPromptModal(global: GlobalState, tabId: number): GlobalState {
  const tabState = selectTabState(global, tabId);
  return updateTabState(global, {
    accountPromptModal: {
      ...tabState.accountPromptModal,
      isOpen: false,
    },
  }, tabId);
}

function openResultsReportModal(
  global: GlobalState,
  page: TabState['consensusResultsModal']['page'],
  tabId: number,
  extPlatformInfo?: ExtPlatformInfo,
  guessedResults?: ConsensusResults,
): GlobalState {
  return updateTabState(global, {
    consensusResultsModal: {
      isOpen: true,
      page,
      extPlatformInfo,
      guessedResults,
    },
  }, tabId);
}

function closeResultsReportModal(global: GlobalState, tabId: number): GlobalState {
  return updateTabState(global, {
    consensusResultsModal: {
      isOpen: false,
      page: 'extPlatform',
    },
  }, tabId);
}

function openLoadingModal(global: GlobalState, title: string, tabId: number): GlobalState {
  return updateTabState(global, {
    loadingModal: {
      isOpen: true,
      title,
    },
  }, tabId);
}

function closeLoadingModal(global: GlobalState, tabId: number): GlobalState {
  return updateTabState(global, {
    loadingModal: {
      isOpen: false,
      title: '',
    },
  }, tabId);
}

addActionHandler('closeLoadingModal', (global, actions, payload): ActionReturnType => {
  const { tabId = getCurrentTabId() } = payload || {};
  return closeLoadingModal(global, tabId);
});

addActionHandler('closeResultsReportModal', (global, actions, payload): ActionReturnType => {
  const { tabId = getCurrentTabId() } = payload || {};
  return closeResultsReportModal(global, tabId);
});

addActionHandler('closeAccountPromptModal', (global, actions, payload): ActionReturnType => {
  const { tabId = getCurrentTabId() } = payload || {};
  return closeAccountPromptModal(global, tabId);
});

addActionHandler('openPollModal', (global, actions, payload): ActionReturnType => {
  const { isQuiz, defaultValues, tabId = getCurrentTabId() } = payload || {};

  return openPollModal(global, tabId, isQuiz, defaultValues);
});

addActionHandler('closePollModal', (global, actions, payload): ActionReturnType => {
  const { tabId = getCurrentTabId() } = payload || {};

  return updateTabState(global, {
    pollModal: {
      isOpen: false,
    },
  }, tabId);
});

function constructAccountOptions(accountMap: AccountMap, platform?: string) {
  const optionStrs = Array.from(accountMap).map(([, user]) => {
    return constructAccountOption(user, platform);
  });

  return optionStrs;
}

addActionHandler('composeConsensusMessage', async (gl, actions, payload): Promise<void> => {
  const { sendPinnedMessage, sendMessage } = actions;
  const { tabId = getCurrentTabId() } = payload || {};
  const messageList = selectCurrentMessageList(gl, tabId);
  switch (payload.type) {
    case 'delegatePoll': {
      let global = openLoadingModal(gl, 'NewPoll', tabId);
      setGlobal(global);
      global = getGlobal();
      await loadRemainingMessages(global);
      global = getGlobal();
      // TODO: Are we sure tabId did not change?
      const tab = selectTabState(global, tabId);
      if (tab.loadingModal.isOpen) {
        // If modal wasn't canceled
        global = closeLoadingModal(global, tabId);

        const platform = getLatestPlatform(global);
        global = createPollWithAccounts(global, SELECT_DELEGATE_STR, tabId, platform, true);
        setGlobal(global);
      }
      break;
    }
    case 'rankingsPoll': {
      let global = openLoadingModal(gl, 'NewPoll', tabId);
      setGlobal(global);
      global = getGlobal();
      await loadRemainingMessages(global);
      global = getGlobal();
      const tab = selectTabState(global, tabId);
      if (tab.loadingModal.isOpen) {
        global = closeLoadingModal(global, tabId);

        const { rank } = payload;
        const question = RANK_POLL_STRS[rank as number - 1];
        const platform = getLatestPlatform(global);
        global = createPollWithAccounts(global, question, tabId, platform, false);
        setGlobal(global);
      }
      break;
    }
    case 'accountPrompt': {
      let { platform } = payload;
      if (!platform) {
        platform = DEFAULT_PLATFORM;
      }
      const global = openAccountPromptModal(gl, platform, tabId);
      setGlobal(global);
      break;
    }
    case 'accountPromptSubmit': {
      const { value } = payload;
      const { platform, promptMessage } = value;
      if (!platform.length || !promptMessage.length) {
        return;
      }

      const { text, entities } = parseHtmlAsFormattedText(promptMessage);
      sendPinnedMessage({
        text, entities, tabId, messageList,
      });

      const global = closeAccountPromptModal(gl, tabId);
      setGlobal(global);
      break;
    }
    case 'resultsReport': {
      let global = openLoadingModal(gl, 'Consensus results', tabId);
      setGlobal(global);
      global = getGlobal();
      await loadRemainingMessages(global);
      global = getGlobal();
      const tab = selectTabState(global, tabId);
      if (tab.loadingModal.isOpen) {
        global = closeLoadingModal(global, tabId);

        const platform = getLatestPlatform(global);

        const extPlatformInfo = platform ? FRACTAL_INFO_BY_PLATFORM[platform] : undefined;

        global = openResultsReportModal(global, 'extPlatform', tabId, extPlatformInfo);
        setGlobal(global);
      }
      break;
    }
    case 'resultsReportPlatformSelect': {
      const { extPlatformInfo } = payload;
      const platform = extPlatformInfo?.platform;
      const results = guessConsensusResults(gl, platform);
      // TODO: signal error
      if (!results) {
        return;
      }

      const nextPage = extPlatformInfo ? 'editGroupNumber' : 'editText';

      const global = openResultsReportModal(gl, nextPage, tabId, extPlatformInfo, results);
      setGlobal(global);
      break;
    }

    case 'resultsReportGroupNumSelect': {
      const { groupNum } = payload;
      const tab = selectTabState(gl, tabId);
      const { extPlatformInfo, guessedResults } = tab.consensusResultsModal;

      assert(extPlatformInfo && guessedResults, 'Platform info and guessedResults have to be defined at this point');

      const results = { ...(guessedResults as ConsensusResults), groupNum };
      const global = openResultsReportModal(gl, 'editText', tabId, extPlatformInfo, results);
      setGlobal(global);
      break;
    }
    case 'resultsReportSubmit': {
      const { message, pinMessage } = payload;

      const { text, entities } = parseHtmlAsFormattedText(message, true);

      if (pinMessage) {
        sendPinnedMessage({
          text, entities, tabId, messageList,
        });
      } else {
        sendMessage({
          text, entities, tabId, messageList,
        });
      }

      const global = closeResultsReportModal(gl, tabId);
      setGlobal(global);
      break;
    }
    default: {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const p: never = payload;
    }
  }
});

function constructAccountOption(user: ExtUser, platform?: string) {
  const extAccount = platform ? user.extAccounts[platform] : undefined;
  let id1 = user.id;
  const id2 = extAccount ? `(${prettifyAccountStr(extAccount)}@${platform})` : '';
  if (user.firstName) {
    id1 = user.firstName;
  } else if (user.usernames && user.usernames.length) {
    id1 = user.usernames[0].username;
  }

  return `${id1} ${id2}`;
}

function optionToAccount(accountMap: AccountMap, optionStr: string): ExtUser | undefined {
  const re = /^(.+) \((.+)@(.+)\)$/;
  const regResult = optionStr.match(re);
  let nameStr: string = optionStr;
  let extAccountStr: string | undefined;
  let platformStr: string | undefined;
  if (regResult) {
    nameStr = regResult[1];
    extAccountStr = regResult[2];
    platformStr = regResult[3];
  }

  const id1Matches = new Array<string>();
  const id2Matches = new Array<string>();
  for (const [userId, user] of accountMap) {
    if (user.firstName === nameStr) {
      id1Matches.push(userId);
    } else if (user.usernames && user.usernames.length && user.usernames[0].username === nameStr) {
      id1Matches.push(userId);
    } else if (userId === nameStr) {
      id1Matches.push(userId);
    }

    if (extAccountStr && platformStr) {
      if (user.extAccounts[platformStr] && user.extAccounts[platformStr] === extAccountStr) {
        id2Matches.push(userId);
      }
    }
  }

  if (id1Matches.length === 1) {
    if (id2Matches.length === 0 || (id2Matches.length === 1 && id2Matches[0] === id1Matches[0])) {
      return accountMap.get(id1Matches[0]);
    }
  }

  return undefined;
}

function getAccountOptions(
  global: GlobalState,
  platform?: string,
  accountMap?: AccountMap,
): string[] | undefined {
  const chat = selectCurrentChat(global);
  accountMap = accountMap || (chat && selectChatMemberAccountMap(global, chat, platform));
  if (!accountMap) {
    return undefined;
  }

  return constructAccountOptions(accountMap, platform);
}

function createPollWithAccounts(
  global: GlobalState,
  question: string,
  tabId: number,
  platform?: string,
  includeRanked?: boolean,
): GlobalState {
  const tab = selectTabState(global, tabId);
  if (tab.pollModal.isOpen) {
    return global;
  }

  const chat = selectCurrentChat(global);
  const accountMap = chat && selectChatMemberAccountMap(global, chat, platform);
  if (!accountMap) {
    return global;
  }

  // NOTE: This should not be called if there are a lot of users in the chat
  const opt = getAccountOptions(global, platform, accountMap);
  assert(opt, 'Chat member list or messages not loaded');
  const options = opt as string[];

  const results = guessConsensusResults(global, platform, chat, accountMap);

  const values: PollModalDefaults = {
    isAnonymous: false,
    pinned: true,
    question,
    options,
    includeRanked: includeRanked ?? false,
  };

  return openPollModal(global, tabId, false, values, results);
}

function getWinnerOption(poll: ApiPoll, accountMap: AccountMap, platform?: string): ConsensusResultOption | undefined {
  const results = poll.results.results;
  if (!results) {
    return undefined;
  }

  let winnerVotes = 0;
  let winnerCount = 0;
  let winnerOption: ConsensusResultOption | undefined;
  for (const result of results) {
    if (result.votersCount > winnerVotes) {
      const answer = poll.summary.answers.find((opt) => opt.option === result.option);
      const refUser = answer && optionToAccount(accountMap, answer.text.text);
      if (answer && refUser) {
        const refreshedOption = constructAccountOption(refUser, platform);
        winnerOption = {
          option: refreshedOption,
          votes: result.votersCount,
          ofTotal: accountMap.size,
          refUser,
        };
        winnerVotes = result.votersCount;
        winnerCount = 1;
      } else {
        winnerCount = 0;
        break;
      }
    } else if (result.votersCount === winnerVotes) {
      winnerCount++;
    }
  }

  return winnerCount === 1 && winnerVotes > 0 ? winnerOption : undefined;
}

function guessConsensusResults(
  global: GlobalState,
  platform?: string,
  chat?: ApiChat,
  accountMap?: AccountMap,
): ConsensusResults | undefined {
  chat = chat || selectCurrentChat(global);
  const membersCount = chat?.membersCount;
  if (!chat || !membersCount) {
    return undefined;
  }

  accountMap = accountMap || selectChatMemberAccountMap(global, chat, platform);
  if (!accountMap) {
    return undefined;
  }

  const consensusResults: ConsensusResults = { rankings: {} };
  const delegatePoll = selectLatestDelegatePoll(global, chat.id);
  if (delegatePoll) {
    consensusResults.delegate = getWinnerOption(delegatePoll, accountMap, platform);
  }

  const userIdsToRank = new Set<string>(accountMap.keys());
  const leftToRank = new Set<Rank>([...ALLOWED_RANKS].slice(0, userIdsToRank.size));
  for (const rank of ALLOWED_RANKS) {
    const poll = selectLatestRankingPoll(global, chat.id, rank);
    if (poll) {
      const winner = getWinnerOption(poll, accountMap, platform);
      if (winner?.refUser && userIdsToRank.has(winner.refUser.id)) {
        consensusResults.rankings[rank] = winner;
        userIdsToRank.delete(winner.refUser.id);
        leftToRank.delete(rank);
      }
    }
  }

  if (userIdsToRank.size === 1 && leftToRank.size === 1) {
    const rankRemaining = Array.from(leftToRank)[0];
    const userIdRemaining = Array.from(userIdsToRank)[0];

    consensusResults.rankings[rankRemaining] = {
      option: constructAccountOption(accountMap.get(userIdRemaining)!, platform),
      refUser: accountMap.get(userIdRemaining),
    };
  }

  return consensusResults;
}

function getLatestPlatform(global: GlobalState): string | undefined {
  const { chatId } = selectCurrentMessageList(global) ?? {};

  const latestPromptStr = chatId && selectLatestPrompt(global, chatId)?.content.text?.text;
  return latestPromptStr && promptStrToPlatform(latestPromptStr);
}
addActionHandler('openTodoListModal', (global, actions, payload): ActionReturnType => {
  const {
    chatId, messageId, forNewTask, tabId = getCurrentTabId(),
  } = payload;

  return updateTabState(global, {
    todoListModal: {
      chatId,
      messageId,
      forNewTask,
    },
  }, tabId);
});

addTabStateResetterAction('closeTodoListModal', 'todoListModal');

addActionHandler('checkVersionNotification', (global, actions): ActionReturnType => {
  if (CHANGELOG_DATETIME && Date.now() > CHANGELOG_DATETIME + VERSION_NOTIFICATION_DURATION) {
    return;
  }

  const currentVersion = APP_VERSION.split('.').slice(0, 2).join('.');
  const { serviceNotifications } = global;

  if (serviceNotifications.find(({ version }) => version === currentVersion)) {
    return;
  }

  const message: Omit<ApiMessage, 'id'> = {
    chatId: SERVICE_NOTIFICATIONS_USER_ID,
    date: getServerTime(),
    content: {
      text: parseHtmlAsFormattedText(versionNotification, true),
    },
    isOutgoing: false,
  };

  actions.createServiceNotification({
    message: message as ApiMessage,
    version: currentVersion,
  });
});

addActionHandler('createServiceNotification', (global, actions, payload): ActionReturnType => {
  const { message, version } = payload;
  const { serviceNotifications } = global;

  const maxId = Math.max(
    selectChatLastMessageId(global, SERVICE_NOTIFICATIONS_USER_ID) || 0,
    ...serviceNotifications.map(({ id }) => id),
  );
  const fractionalPart = (serviceNotifications.length + 1) / SERVICE_NOTIFICATIONS_MAX_AMOUNT;
  // The fractional ID is made of the largest integer ID and an incremented fractional part
  const id = Math.floor(maxId) + fractionalPart;

  message.previousLocalId = message.id;
  message.id = id;

  const serviceNotification = {
    id,
    message,
    version,
    isUnread: true,
  };

  global = {
    ...global,
    serviceNotifications: [
      ...serviceNotifications.slice(-SERVICE_NOTIFICATIONS_MAX_AMOUNT),
      serviceNotification,
    ],
  };
  setGlobal(global);

  actions.apiUpdate({
    '@type': 'newMessage',
    id: message.id,
    chatId: message.chatId,
    message,
  });
});

addActionHandler('openReactorListModal', (global, actions, payload): ActionReturnType => {
  const { chatId, messageId, tabId = getCurrentTabId() } = payload;

  return updateTabState(global, {
    reactorModal: { chatId, messageId },
  }, tabId);
});

addActionHandler('closeReactorListModal', (global, actions, payload): ActionReturnType => {
  const { tabId = getCurrentTabId() } = payload || {};

  return updateTabState(global, {
    reactorModal: undefined,
  }, tabId);
});

addActionHandler('openSeenByModal', (global, actions, payload): ActionReturnType => {
  const { chatId, messageId, tabId = getCurrentTabId() } = payload;

  return updateTabState(global, {
    seenByModal: { chatId, messageId },
  }, tabId);
});

addActionHandler('closeSeenByModal', (global, actions, payload): ActionReturnType => {
  const { tabId = getCurrentTabId() } = payload || {};

  return updateTabState(global, {
    seenByModal: undefined,
  }, tabId);
});

addActionHandler('openPrivacySettingsNoticeModal', (global, actions, payload): ActionReturnType => {
  const { chatId, isReadDate, tabId = getCurrentTabId() } = payload;

  return updateTabState(global, {
    privacySettingsNoticeModal: { chatId, isReadDate },
  }, tabId);
});

addActionHandler('closePrivacySettingsNoticeModal', (global, actions, payload): ActionReturnType => {
  const { tabId = getCurrentTabId() } = payload || {};

  return updateTabState(global, {
    privacySettingsNoticeModal: undefined,
  }, tabId);
});

addActionHandler('openChatLanguageModal', (global, actions, payload): ActionReturnType => {
  const { chatId, messageId, tabId = getCurrentTabId() } = payload;

  const activeLanguage = messageId
    ? selectRequestedMessageTranslationLanguage(global, chatId, messageId, tabId)
    : selectRequestedChatTranslationLanguage(global, chatId, tabId);

  return updateTabState(global, {
    chatLanguageModal: { chatId, messageId, activeLanguage },
  }, tabId);
});

addActionHandler('closeChatLanguageModal', (global, actions, payload): ActionReturnType => {
  const { tabId = getCurrentTabId() } = payload || {};

  return updateTabState(global, {
    chatLanguageModal: undefined,
  }, tabId);
});

addActionHandler('copySelectedMessages', (global, actions, payload): ActionReturnType => {
  const { tabId = getCurrentTabId() } = payload || {};
  const tabState = selectTabState(global, tabId);
  if (!tabState.selectedMessages) {
    return;
  }

  const { chatId, messageIds } = tabState.selectedMessages;
  copyTextForMessages(global, chatId, messageIds);
});

addActionHandler('copyMessagesByIds', (global, actions, payload): ActionReturnType => {
  const { messageIds, tabId = getCurrentTabId() } = payload;
  const chat = selectCurrentChat(global, tabId);
  if (!messageIds || messageIds.length === 0 || !chat) {
    return;
  }

  copyTextForMessages(global, chat.id, messageIds);
});

addActionHandler('openOneTimeMediaModal', (global, actions, payload): ActionReturnType => {
  const { message, tabId = getCurrentTabId() } = payload;
  global = updateTabState(global, {
    oneTimeMediaModal: {
      message,
    },
  }, tabId);
  setGlobal(global);
});

addActionHandler('closeOneTimeMediaModal', (global, actions, payload): ActionReturnType => {
  const { tabId = getCurrentTabId() } = payload || {};
  global = updateTabState(global, {
    oneTimeMediaModal: undefined,
  }, tabId);
  setGlobal(global);
});

addActionHandler('closeReportAdModal', (global, actions, payload): ActionReturnType => {
  const { tabId = getCurrentTabId() } = payload || {};
  return updateTabState(global, {
    reportAdModal: undefined,
  }, tabId);
});

addActionHandler('closeReportModal', (global, actions, payload): ActionReturnType => {
  const { tabId = getCurrentTabId() } = payload || {};
  return updateTabState(global, {
    reportModal: undefined,
  }, tabId);
});

addActionHandler('openPreviousReportAdModal', (global, actions, payload): ActionReturnType => {
  const { tabId = getCurrentTabId() } = payload || {};
  const reportAdModal = selectTabState(global, tabId).reportAdModal;
  if (!reportAdModal) {
    return undefined;
  }

  if (reportAdModal.sections.length === 1) {
    actions.closeReportAdModal({ tabId });
    return undefined;
  }

  return updateTabState(global, {
    reportAdModal: {
      ...reportAdModal,
      sections: reportAdModal.sections.slice(0, -1),
    },
  }, tabId);
});

addActionHandler('openPreviousReportModal', (global, actions, payload): ActionReturnType => {
  const { tabId = getCurrentTabId() } = payload || {};
  const reportModal = selectTabState(global, tabId).reportModal;
  if (!reportModal) {
    return undefined;
  }

  if (reportModal.sections.length === 1) {
    actions.closeReportModal({ tabId });
    return undefined;
  }

  return updateTabState(global, {
    reportModal: {
      ...reportModal,
      sections: reportModal.sections.slice(0, -1),
    },
  }, tabId);
});

addActionHandler('openPaidReactionModal', (global, actions, payload): ActionReturnType => {
  const { chatId, messageId, tabId = getCurrentTabId() } = payload;
  return updateTabState(global, {
    paidReactionModal: { chatId, messageId },
  }, tabId);
});

addActionHandler('closePaidReactionModal', (global, actions, payload): ActionReturnType => {
  const { tabId = getCurrentTabId() } = payload || {};
  return updateTabState(global, {
    paidReactionModal: undefined,
  }, tabId);
});

addActionHandler('openSuggestMessageModal', (global, actions, payload): ActionReturnType => {
  const { chatId, messageId, tabId = getCurrentTabId() } = payload;
  return updateTabState(global, {
    suggestMessageModal: { chatId, messageId },
  }, tabId);
});

addActionHandler('closeSuggestMessageModal', (global, actions, payload): ActionReturnType => {
  const { tabId = getCurrentTabId() } = payload || {};
  return updateTabState(global, {
    suggestMessageModal: undefined,
  }, tabId);
});

addActionHandler('openSuggestedPostApprovalModal', (global, actions, payload): ActionReturnType => {
  const { chatId, messageId, tabId = getCurrentTabId() } = payload;
  return updateTabState(global, {
    suggestedPostApprovalModal: { chatId, messageId },
  }, tabId);
});

addActionHandler('closeSuggestedPostApprovalModal', (global, actions, payload): ActionReturnType => {
  const { tabId = getCurrentTabId() } = payload || {};
  return updateTabState(global, {
    suggestedPostApprovalModal: undefined,
  }, tabId);
});

function copyTextForMessages(global: GlobalState, chatId: string, messageIds: number[]) {
  const { type: messageListType, threadId } = selectCurrentMessageList(global) || {};
  const lang = getTranslationFn();

  const chat = selectChat(global, chatId);

  const chatMessages = messageListType === 'scheduled'
    ? selectChatScheduledMessages(global, chatId)
    : selectChatMessages(global, chatId);

  if (!chat || !chatMessages || !threadId) return;

  const messages = messageIds
    .map((id) => chatMessages[id])
    .filter((message) => selectAllowedMessageActionsSlow(global, message, threadId).canCopy)
    .sort((message1, message2) => message1.id - message2.id);

  const resultHtml: string[] = [];
  const resultText: string[] = [];

  messages.forEach((message) => {
    const sender = isChatChannel(chat) ? chat : selectSender(global, message);
    const senderTitle = `> ${sender ? getPeerTitle(lang, sender) : message.forwardInfo?.hiddenUserName || ''}:`;
    const statefulContent = getMessageStatefulContent(global, message);

    resultHtml.push(senderTitle);
    resultHtml.push(`${renderMessageSummaryHtml(lang, message)}\n`);

    resultText.push(senderTitle);
    resultText.push(`${getMessageSummaryText(lang, message, statefulContent, false, 0, true)}\n`);
  });

  copyHtmlToClipboard(resultHtml.join('\n'), resultText.join('\n'));
}

addActionHandler('openDeleteMessageModal', (global, actions, payload): ActionReturnType => {
  const {
    chatId, messageIds, isSchedule,
    tabId = getCurrentTabId(),
  } = payload;

  global = getGlobal();
  global = updateTabState(global, {
    deleteMessageModal: {
      chatId,
      messageIds,
      isSchedule,
    },
  }, tabId);
  setGlobal(global);
});

addActionHandler('closeDeleteMessageModal', (global, actions, payload): ActionReturnType => {
  const { tabId = getCurrentTabId() } = payload || {};

  return updateTabState(global, {
    deleteMessageModal: undefined,
  }, tabId);
});

addActionHandler('openAboutAdsModal', (global, actions, payload): ActionReturnType => {
  const {
    randomId, additionalInfo, canReport, sponsorInfo, tabId = getCurrentTabId(),
  } = payload || {};

  return updateTabState(global, {
    aboutAdsModal: {
      randomId,
      canReport,
      additionalInfo,
      sponsorInfo,
    },
  }, tabId);
});

addActionHandler('closeAboutAdsModal', (global, actions, payload): ActionReturnType => {
  const { tabId = getCurrentTabId() } = payload || {};

  return updateTabState(global, {
    aboutAdsModal: undefined,
  }, tabId);
});

addActionHandler('closePreparedInlineMessageModal', (global, actions, payload): ActionReturnType => {
  const { tabId = getCurrentTabId() } = payload || {};

  return updateTabState(global, {
    preparedMessageModal: undefined,
  }, tabId);
});

addActionHandler('closeSharePreparedMessageModal', (global, actions, payload): ActionReturnType => {
  const { tabId = getCurrentTabId() } = payload || {};

  return updateTabState(global, {
    sharePreparedMessageModal: undefined,
  }, tabId);
});

addActionHandler('updateSharePreparedMessageModalSendArgs', async (global, actions, payload): Promise<void> => {
  const { args, tabId = getCurrentTabId() } = payload || {};
  const tabState = selectTabState(global, tabId);

  if (!tabState.sharePreparedMessageModal) {
    return;
  }

  if (!args) {
    global = updateTabState(global, {
      sharePreparedMessageModal: {
        ...tabState.sharePreparedMessageModal,
        pendingSendArgs: undefined,
      },
    }, tabId);
    setGlobal(global);
    return;
  }

  const starsForSendMessage = await getPeerStarsForMessage(global, args.peerId);

  global = getGlobal();
  global = updateTabState(global, {
    sharePreparedMessageModal: {
      ...tabState.sharePreparedMessageModal,
      pendingSendArgs: {
        peerId: args.peerId,
        threadId: args.threadId,
        starsForSendMessage,
      },
    },
  }, tabId);
  setGlobal(global);
});

addActionHandler('openQuickPreview', (global, actions, payload): ActionReturnType => {
  const { id: chatId, threadId, tabId = getCurrentTabId() } = payload;

  return updateTabState(global, {
    quickPreview: { chatId, threadId },
  }, tabId);
});

addActionHandler('closeQuickPreview', (global, actions, payload): ActionReturnType => {
  const { tabId = getCurrentTabId() } = payload || {};

  return updateTabState(global, {
    quickPreview: undefined,
  }, tabId);
});
