import type { ChangeEvent } from 'react';
import type { FC } from '../../../lib/teact/teact';
import React, {
  memo, useCallback, useEffect, useState,
} from '../../../lib/teact/teact';

import buildClassName from '../../../util/buildClassName';

import useLang from '../../../hooks/useLang';

import Button from '../../ui/Button';
// import TextArea from '../../ui/TextArea';
import Checkbox from '../../ui/Checkbox';
import Modal from '../../ui/Modal';

import './PollModal.scss';

export type OwnProps = {
  isOpen: boolean;
  defaultMessage: string;
  pinMessageDefault?: boolean;
  onSend: (message: string, toPin: boolean) => void;
  onClear: () => void;
};

const SendMessageModal: FC<OwnProps> = ({
  isOpen, defaultMessage, pinMessageDefault, onSend, onClear,
}) => {
  const [message, setMessage] = useState<string>(defaultMessage);
  const [hasErrors, setHasErrors] = useState<boolean>(false);
  const [toPin, setToPin] = useState<boolean>(pinMessageDefault ?? false);

  const lang = useLang();

  useEffect(() => {
    if (isOpen) {
      setMessage(defaultMessage);
    }
  }, [isOpen, defaultMessage]);

  useEffect(() => {
    if (isOpen) {
      setToPin(pinMessageDefault ?? false);
    }
  }, [pinMessageDefault, isOpen]);

  const handleMessageChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
  }, []);

  const handleToPinChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setToPin(e.target.checked);
  }, []);

  const handleSend = useCallback(() => {
    if (!message.length) {
      setHasErrors(true);
      return;
    }

    onSend(message, toPin);
  }, [onSend, message, toPin]);

  const getMessageError = useCallback(() => {
    if (hasErrors && !message.length) {
      return lang('Message should not be empty');
    }

    return undefined;
  }, [hasErrors, lang, message]);

  function renderHeader() {
    return (
      <div className="modal-header-condensed">
        <Button round color="translucent" size="smaller" ariaLabel="Cancel message creation" onClick={onClear}>
          <i className="icon-close" />
        </Button>
        <div className="modal-title">{lang('Send message')}</div>
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

  const err = getMessageError();
  const labelText = err || lang('Message');
  const fullClass = buildClassName(
    'form-control',
    err ? 'error' : undefined,
  );

  return (
    <Modal isOpen={isOpen} onClose={onClear} header={renderHeader()}>

      <Checkbox
        label={lang('Pin message')}
        checked={toPin}
        onChange={handleToPinChange}
      />

      <textarea
        className={fullClass}
        dir="auto"
        value={message}
        inputMode="text"
        onChange={handleMessageChange}
        aria-label={labelText}
        style="height:28em;"
      />

    </Modal>
  );
};

export default memo(SendMessageModal);
