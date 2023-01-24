import type { ChangeEvent } from 'react';
import type { FC } from '../../../lib/teact/teact';
import React, {
  memo, useCallback, useEffect, useState, useMemo,
} from '../../../lib/teact/teact';

import captureEscKeyListener from '../../../util/captureEscKeyListener';
import useLang from '../../../hooks/useLang';

import Button from '../../ui/Button';
import Modal from '../../ui/Modal';
import InputText from '../../ui/InputText';

import './PollModal.scss';
import type { AccountPromptInfo, AccountPromptDefaults } from '../../../global/types';
import TextArea from '../../ui/TextArea';

export type OwnProps = {
  isOpen: boolean;
  defaultValues: AccountPromptDefaults;
  onSend: (info: AccountPromptInfo) => void;
  onClear: () => void;
};

function composePrompt(platform: string) {
  return `Please enter your ${platform} account as a reply to this message`;
}

const AccountPromptModal: FC<OwnProps> = ({
  isOpen, defaultValues, onSend, onClear,
}) => {
  const [platform, setPlatform] = useState<string>(defaultValues.platform);
  const [hasErrors, setHasErrors] = useState<boolean>(false);

  const promptMsg = useMemo(() => composePrompt(platform), [platform]);

  const lang = useLang();

  useEffect(() => (isOpen ? captureEscKeyListener(onClear) : undefined), [isOpen, onClear]);
  useEffect(() => {
    if (!isOpen) {
      setHasErrors(false);
    } else if (isOpen && defaultValues) {
      setPlatform(defaultValues.platform);
    }
  }, [isOpen, defaultValues]);

  const handleSend = useCallback(() => {
    if (!platform.length) {
      setHasErrors(true);
      return;
    }

    onSend({ platform, promptMessage: promptMsg });
  }, [onSend, platform, setHasErrors, promptMsg]);

  const handlePlatformChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const newPlatform = e.target.value;
    setPlatform(newPlatform);
  }, []);

  const getPlatformError = useCallback(() => {
    if (hasErrors && !platform.trim().length) {
      return lang('Please enter platform name');
    }

    return undefined;
  }, [hasErrors, lang, platform]);

  // TODO: Message preview
  function renderHeader() {
    return (
      <div className="modal-header-condensed">
        <Button round color="translucent" size="smaller" ariaLabel="Cancel message creation" onClick={onClear}>
          <i className="icon-close" />
        </Button>
        <div className="modal-title">{lang('Send account prompt')}</div>
        <Button
          color="primary"
          size="smaller"
          className="modal-action-button"
          onClick={handleSend}
        >
          {lang('Send')}
        </Button>
      </div>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={onClear} header={renderHeader()} className="PollModal">
      <InputText
        label={lang('Platform')}
        value={platform}
        onChange={handlePlatformChange}
        error={getPlatformError()}
      />

      <TextArea
        label={lang('Message Preview')}
        disabled
        value={promptMsg}
      />

    </Modal>
  );
};

export default memo(AccountPromptModal);
