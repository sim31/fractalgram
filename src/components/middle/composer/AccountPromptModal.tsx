import type { ChangeEvent } from 'react';
import type { FC } from '../../../lib/teact/teact';
import React, {
  memo, useCallback, useEffect, useMemo,
  useState,
} from '../../../lib/teact/teact';

import type { AccountPromptDefaults, AccountPromptInfo } from '../../../global/types';

import { composePrompt } from '../../../global/helpers/consensusMessages';
import captureEscKeyListener from '../../../util/captureEscKeyListener';

import useLang from '../../../hooks/useLang';

import Button from '../../ui/Button';
import InputText from '../../ui/InputText';
import Modal from '../../ui/Modal';
import RadioGroup, { type IRadioOption } from '../../ui/RadioGroup';
import TextArea from '../../ui/TextArea';

import './PollModal.scss';

export type OwnProps = {
  isOpen: boolean;
  defaultValues: AccountPromptDefaults;
  presetPlatforms: string[];
  onSend: (info: AccountPromptInfo) => void;
  onClear: () => void;
};

const AccountPromptModal: FC<OwnProps> = ({
  isOpen, defaultValues, onSend, onClear, presetPlatforms,
}) => {
  const [platform, setPlatform] = useState<string>(defaultValues.platform);
  const defaultPreset = useMemo(() => {
    return presetPlatforms.find((p) => p === defaultValues.platform);
  }, [presetPlatforms, defaultValues.platform]);
  const [presetSelection, setPreset] = useState<string>(defaultPreset ?? 'custom');
  const [hasErrors, setHasErrors] = useState<boolean>(false);

  const promptMsg = useMemo(() => composePrompt(platform), [platform]);

  const lang = useLang();

  useEffect(() => (isOpen ? captureEscKeyListener(onClear) : undefined), [isOpen, onClear]);
  useEffect(() => {
    if (!isOpen) {
      setHasErrors(false);
    } else if (isOpen && defaultValues) {
      setPlatform(defaultValues.platform);
      setPreset(defaultPreset ?? 'custom');
    }
  }, [isOpen, defaultValues, defaultPreset]);

  const handleSend = useCallback(() => {
    if (!platform.length) {
      setHasErrors(true);
      return;
    }

    onSend({ platform, promptMessage: promptMsg });
  }, [onSend, platform, promptMsg]);

  const handlePlatformChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const newPlatform = e.target.value;
    setPlatform(newPlatform);
  }, []);

  const handlePresetSelection = useCallback((newSelection: string) => {
    if (newSelection === 'custom') {
      setPreset(newSelection);
      setPlatform('');
    } else {
      setPreset(newSelection);
      setPlatform(newSelection);
    }
  }, []);

  const getPlatformError = useCallback(() => {
    if (hasErrors && !platform.trim().length) {
      return lang('Please enter platform name');
    }

    return undefined;
  }, [hasErrors, lang, platform]);

  const radioOptions = useMemo(() => {
    const roptions = new Array<IRadioOption>();
    const preset = Object.values(presetPlatforms).map((platformName) => {
      return {
        label: platformName,
        value: platformName,
      };
    });
    roptions.push(...preset);
    roptions.push({ label: 'Custom', value: 'custom' });

    return roptions;
  }, [presetPlatforms]);

  // TODO: Message preview
  function renderHeader() {
    return (
      <div className="modal-header-condensed">
        <Button round color="translucent" size="smaller" ariaLabel="Cancel message creation" onClick={onClear}>
          <i className="icon icon-close" />
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
      <RadioGroup
        name="preset"
        options={radioOptions}
        selected={presetSelection}
        onChange={handlePresetSelection}
      />

      <InputText
        label={lang('Platform')}
        value={platform}
        onChange={handlePlatformChange}
        disabled={presetSelection !== 'custom'}
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
