import { setGlobal } from '../../../lib/teact/teactn';
import { addActionHandler } from '../../index';
import { addCustomList, removeCustomList } from '../../reducers';

addActionHandler('addCustomList', (global, actions, payload) => {
  const {
    id, testFn, initFromChatsById, expected, active,
  } = payload;
  const newGlobal = addCustomList(global, id, testFn, initFromChatsById, expected, active);

  setGlobal(newGlobal);

  return undefined;
});

addActionHandler('removeCustomList', (global, actions, payload) => {
  const { id } = payload;
  const newGlobal = removeCustomList(global, id);

  setGlobal(newGlobal);

  return undefined;
});
