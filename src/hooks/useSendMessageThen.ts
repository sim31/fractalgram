import { useCallback } from '../lib/teact/teact';
import type { ApiMessage } from '../api/types';
import type { CustomListId, GlobalState } from '../global/types';
import generateIdFor from '../util/generateIdFor';
import { addCallback } from '../lib/teact/teactn';
import { getGlobal, getActions } from '../global';
import { selectChatMessage, selectCustomList } from '../global/selectors';
import { areDeepEqual } from '../util/areDeepEqual';

export type SentMessageHandler = (msg: ApiMessage) => void;

type Registrations = Record<CustomListId, SentMessageHandler[]>;
const registrations: Registrations = {};
let prevGlobal: GlobalState | undefined;

addCallback((global: GlobalState) => {
  if (global.messages.customListsById !== prevGlobal?.messages.customListsById) {
    const handlersToRemove = [] as CustomListId[];
    Object.entries(registrations).forEach(([listId, handlers]) => {
      const oldList = prevGlobal && selectCustomList(prevGlobal, listId);
      const newList = selectCustomList(global, listId);
      if (newList?.messageIds !== oldList?.messageIds) {
        if (newList.messageIds.length) {
          const { chatId, messageId } = newList.messageIds[0];
          const message = selectChatMessage(global, chatId, messageId);
          if (message !== undefined) {
            for (const handler of handlers) {
              try {
                handler(message);
              } catch (e) {
                // eslint-disable-next-line no-console
                console.error('sendMessageThenHandler threw an exception: ', e);
              }
            }
          } else {
            // eslint-disable-next-line no-console
            console.error('Expected message not present', message, newList);
          }
          handlersToRemove.push(listId);
        } else {
          // eslint-disable-next-line no-console
          console.warn('Message list changed but does not contain elements', newList);
        }
      }
    });
    for (const listId of handlersToRemove) {
      delete registrations[listId];
      getActions().removeCustomList({ id: listId });
    }
  }
  prevGlobal = global;
});

const useSendMessageThen = (chatId: string, sendAsId: string | undefined) => {
  const { addCustomList, sendMessage } = getActions();
  const sendMessageThen = useCallback((sendMessagePayload: any, thenCb: SentMessageHandler) => {
    const listId = generateIdFor(getGlobal().messages.customListsById);
    if (!registrations[listId]) {
      registrations[listId] = [];
    }
    registrations[listId].push(thenCb);
    const testFn = (msg: ApiMessage) => {
      // TODO: Check how often sendAsId is undefined
      return (!sendAsId || msg.senderId === sendAsId)
             && msg.chatId === chatId
             && sendMessagePayload.text === msg.content.text?.text
             && areDeepEqual(sendMessagePayload.poll, msg.content.poll);
    };
    addCustomList({ id: listId, testFn, expected: 'single' });
    sendMessage(sendMessagePayload);
  }, [chatId, sendAsId, addCustomList, sendMessage]);

  return sendMessageThen;
};

export default useSendMessageThen;
