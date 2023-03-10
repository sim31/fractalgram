import type { ChangeEvent } from 'react';
import useLang from '../../../hooks/useLang';
import type { FC } from '../../../lib/teact/teact';
import React, {
  memo, useCallback, useEffect, useState,
} from '../../../lib/teact/teact';
import Button from '../../ui/Button';
import Modal from '../../ui/Modal';
import InputText from '../../ui/InputText';

export type OwnProps = {
  isOpen: boolean;
  defaultGroupNum?: number;
  onClear: () => void;
  onSubmit: (groupNum: number) => void;
};

const GroupNumberEdit: FC<OwnProps> = ({
  isOpen, defaultGroupNum, onClear, onSubmit,
}) => {
  const lang = useLang();

  const [hasErrors, setHassErrors] = useState<boolean>(false);
  const [groupNumber, setGroupNumber] = useState<string>(defaultGroupNum?.toString() ?? '');

  useEffect(() => {
    if (isOpen) {
      setGroupNumber(defaultGroupNum?.toString() ?? '');
    }
  }, [defaultGroupNum, isOpen]);

  const handleGroupNumChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setGroupNumber(e.target.value);
  }, []);

  const handleSubmit = useCallback(() => {
    const num = Number(groupNumber);
    if (Number.isNaN(num)) {
      setHassErrors(true);
      return;
    }

    onSubmit(num);
  }, [groupNumber, onSubmit]);

  const getGroupNumError = useCallback(() => {
    if (hasErrors) {
      const num = Number(groupNumber);
      if (Number.isNaN(num)) {
        return lang('Has to be a number');
      }
    }

    return undefined;
  }, [hasErrors, groupNumber, lang]);

  function renderHeader() {
    return (
      <div className="modal-header-condensed">
        <Button round color="translucent" size="smaller" ariaLabel="Cancel message creation" onClick={onClear}>
          <i className="icon-close" />
        </Button>
        <div className="modal-title">{lang('Group number')}</div>
        <Button
          color="primary"
          size="smaller"
          className="modal-action-button"
          onClick={handleSubmit}
        >
          {lang('Next')}
        </Button>
      </div>
    );
  }
  return (
    <Modal isOpen={isOpen} onClose={onClear} header={renderHeader()} className="PollModal">
      <InputText
        label={lang('Group number')}
        value={groupNumber}
        inputMode="numeric"
        error={getGroupNumError()}
        onChange={handleGroupNumChange}
      />
    </Modal>
  );
};

export default memo(GroupNumberEdit);
