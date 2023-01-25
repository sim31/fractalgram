// import { ChangeEvent, RefObject, useMemo } from 'react';
import type { FC } from '../../../lib/teact/teact';
import React, {
  memo, useCallback, useEffect, useState,
} from '../../../lib/teact/teact';

// import type { ApiNewPoll } from '../../../api/types';

// import captureEscKeyListener from '../../../util/captureEscKeyListener';
// import parseMessageInput from '../../../util/parseMessageInput';
import useLang from '../../../hooks/useLang';

import Button from '../../ui/Button';
import Modal from '../../ui/Modal';
// import InputText from '../../ui/InputText';
// import Checkbox from '../../ui/Checkbox';
// import RadioGroup from '../../ui/RadioGroup';
// import { IRadioOption } from '../../ui/RadioGroup';

import './PollModal.scss';
// import { ActionPayloads, ConsensusResultOption, ConsensusResults, ExtPlatformInfo, GlobalState } from '../../../global/types';
// import { getActions } from '../../../lib/teact/teactn';
import { FRACTAL_INFO } from '../../../config';
import ExtPlatformSettings from './ExtPlatformSettings';
import type { ExtPlatformInfo, GlobalState } from '../../../global/types';

export type OwnProps = {
  values: GlobalState['consensusResultsModal'];
  onSend: (msg: string, pinned: boolean) => void;
  onClear: () => void;
};

const FractalResultModal: FC<OwnProps> = ({
  values, onClear, // onSend
}) => {
  const {
    isOpen, page, extPlatformInfo, // guessedResults
  } = values;
  // const { composeConsensusMessage } = getActions();
  const lang = useLang();

  const [extPlatform, setExtPlatform] = useState<ExtPlatformInfo | undefined>(extPlatformInfo);

  useEffect(() => {
    setExtPlatform(extPlatformInfo);
  }, [extPlatformInfo]);

  const handleExtPlatformChange = useCallback((newVal: ExtPlatformInfo | undefined) => {
    setExtPlatform(newVal);
  }, []);

  const handleSend = useCallback(() => {

  }, []);

  function renderHeader() {
    const title = page === 'extPlatform' ? 'Link to platform' : 'Send consensus report';
    return (
      <div className="modal-header-condensed">
        <Button round color="translucent" size="smaller" ariaLabel="Cancel message creation" onClick={onClear}>
          <i className="icon-close" />
        </Button>
        <div className="modal-title">{title}</div>
        <Button
          color="primary"
          size="smaller"
          className="modal-action-button"
          onClick={handleSend}
        >
          {lang('Next')}
        </Button>
      </div>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={onClear} header={renderHeader()} className="PollModal">

      {page === 'extPlatform' && (
        <ExtPlatformSettings
          options={FRACTAL_INFO}
          selection={extPlatform}
          onChange={handleExtPlatformChange}
        />
      )}

    </Modal>
  );
};

export default memo(FractalResultModal);
