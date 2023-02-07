import type { FC } from '../../../lib/teact/teact';
import { getActions } from '../../../global';
import React, {
  memo, useCallback, useMemo,
} from '../../../lib/teact/teact';
import './PollModal.scss';
import { FRACTAL_INFO } from '../../../config';
import ExtPlatformSettings from './ExtPlatformSettings';
import type { ExtPlatformInfo, GlobalState } from '../../../global/types';
import { createConsensusResultMsg } from '../../../global/helpers/consensusMessages';
import GroupNumberEdit from './GroupNumberEdit';
import SendMessageModal from './SendMessageModal';

export type OwnProps = {
  values: GlobalState['consensusResultsModal'];
  onSend: (msg: string, pinned: boolean) => void;
  onClear: () => void;
};

const FractalResultModal: FC<OwnProps> = ({
  values, onClear, // onSend
}) => {
  const {
    isOpen, page, extPlatformInfo, guessedResults,
  } = values;
  const { composeConsensusMessage } = getActions();

  const guessedMessage = useMemo<string>(() => {
    if (guessedResults) {
      return createConsensusResultMsg(
        guessedResults,
        extPlatformInfo?.submitUrl,
        extPlatformInfo?.platform,
        extPlatformInfo?.accountInfoUrl,
      );
    } else {
      return '';
    }
  }, [guessedResults, extPlatformInfo]);

  const handlePlatformSubmit = useCallback((selection?: ExtPlatformInfo) => {
    composeConsensusMessage({ type: 'resultsReportPlatformSelect', extPlatformInfo: selection });
  }, [composeConsensusMessage]);

  const handleGroupNumSubmit = useCallback((groupNum: number) => {
    composeConsensusMessage({ type: 'resultsReportGroupNumSelect', groupNum });
  }, [composeConsensusMessage]);

  const handleSend = useCallback((msg: string, toPin: boolean) => {
    composeConsensusMessage({
      type: 'resultsReportSubmit',
      message: msg,
      pinMessage: toPin,
    });
  }, [composeConsensusMessage]);

  return (
    <div>
      <ExtPlatformSettings
        isOpen={page === 'extPlatform' && isOpen}
        defaultExtPlatform={extPlatformInfo}
        presetOptions={FRACTAL_INFO}
        onClear={onClear}
        onSubmit={handlePlatformSubmit}
      />

      <GroupNumberEdit
        isOpen={page === 'editGroupNumber' && isOpen}
        defaultGroupNum={guessedResults?.groupNum}
        onClear={onClear}
        onSubmit={handleGroupNumSubmit}
      />

      <SendMessageModal
        isOpen={page === 'editText' && isOpen}
        defaultMessage={guessedMessage}
        pinMessageDefault
        onClear={onClear}
        onSend={handleSend}
      />

    </div>
  );
};

export default memo(FractalResultModal);
