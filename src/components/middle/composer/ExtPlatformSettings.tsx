import type { ChangeEvent } from 'react';
import type { ExtPlatformInfo } from '../../../global/types';
import useLang from '../../../hooks/useLang';
import type { FC } from '../../../lib/teact/teact';
import React, {
  memo, useCallback, useMemo, useEffect, useState,
} from '../../../lib/teact/teact';
import RadioGroup from '../../ui/RadioGroup';
import type { IRadioOption } from '../../ui/RadioGroup';
import InputText from '../../ui/InputText';
import Modal from '../../ui/Modal';
import Button from '../../ui/Button';
import assert from '../../../util/assert';
import { PLATFORM_RE } from '../../../config';

export type OwnProps = {
  isOpen: boolean;
  defaultExtPlatform?: ExtPlatformInfo;
  presetOptions: Record<string, ExtPlatformInfo>;
  onSubmit: (selection?: ExtPlatformInfo) => void;
  onClear: () => void;
};

const ExtPlatformSettings: FC<OwnProps> = ({
  isOpen, defaultExtPlatform, presetOptions, onSubmit, onClear,
}) => {
  const lang = useLang();

  const [extPlatform, setExtPlatform] = useState<ExtPlatformInfo | undefined>(defaultExtPlatform);
  const [hasErrors, setHasErrors] = useState<boolean>(false);

  useEffect(() => {
    setExtPlatform(defaultExtPlatform);
  }, [defaultExtPlatform]);

  const radioSelection = useMemo(() => {
    if (!extPlatform) {
      return 'none';
    } else {
      const matchingInfo = presetOptions[extPlatform.fractalName];
      if (matchingInfo?.platform === extPlatform.platform
          && matchingInfo?.submitUrl === extPlatform.submitUrl) {
        return extPlatform.fractalName;
      }
    }

    return 'custom';
  }, [extPlatform, presetOptions]);

  const radioOptions = useMemo(() => {
    const roptions = new Array<IRadioOption>();
    roptions.push({ label: 'None', value: 'none' });
    const preset = Object.values(presetOptions).map((info) => {
      return {
        label: info.fractalName,
        subLabel: `platform: ${info.platform}, url: ${info.submitUrl}`,
        value: info.fractalName,
      };
    });
    roptions.push(...preset);
    roptions.push({ label: 'Custom', value: 'custom' });

    return roptions;
  }, [presetOptions]);

  const platform = useMemo(() => {
    if (!extPlatform) {
      return '';
    } else {
      return extPlatform.platform;
    }
  }, [extPlatform]);

  const submitUrl = useMemo(() => {
    if (!extPlatform) {
      return 'https://';
    } else {
      return extPlatform.submitUrl;
    }
  }, [extPlatform]);

  const handleExtPlatformChange = useCallback((newSelection: string) => {
    if (newSelection === 'none') {
      setExtPlatform(undefined);
    } else if (newSelection === 'custom') {
      setExtPlatform({
        fractalName: 'custom',
        platform: '',
        submitUrl: 'https://',
      });
    } else {
      setExtPlatform(presetOptions[newSelection]);
    }
  }, [presetOptions]);

  const handleCustomChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.currentTarget;
    if (!extPlatform) {
      // This should never happen
      return;
    }
    setExtPlatform({ ...extPlatform, [id]: value });
  }, [extPlatform]);

  const getPlatformError = useCallback(() => {
    if (hasErrors && extPlatform) {
      const match = (extPlatform as ExtPlatformInfo).platform.match(PLATFORM_RE);
      if (!match) {
        return lang('Platform name has to be one word');
      }
    }

    return undefined;
  }, [extPlatform, lang, hasErrors]);

  // TODO: Check if valid URL as well
  const handleSubmit = useCallback(() => {
    if (radioSelection === 'none') {
      onSubmit(undefined);
    } else {
      assert(extPlatform, 'extPlatform cannnot be undefined here');
      const match = (extPlatform as ExtPlatformInfo).platform.match(PLATFORM_RE);
      if (!match) {
        setHasErrors(true);
      } else {
        onSubmit(extPlatform);
      }
    }
  }, [onSubmit, extPlatform, radioSelection]);

  function renderHeader() {
    return (
      <div className="modal-header-condensed">
        <Button round color="translucent" size="smaller" ariaLabel="Cancel message creation" onClick={onClear}>
          <i className="icon-close" />
        </Button>
        <div className="modal-title">{lang('Link to platform')}</div>
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

  // TODO: Check that platform input is a single word
  return (
    <Modal isOpen={isOpen} onClose={onClear} header={renderHeader()} className="PollModal">
      {/* <h3 className="options-header">{lang('Link to external platform')}</h3> */}
      <RadioGroup
        name="extplatform"
        options={radioOptions}
        selected={radioSelection}
        onChange={handleExtPlatformChange}
      />

      <InputText
        id="platform"
        label={lang('Platform')}
        value={platform}
        onChange={handleCustomChange}
        disabled={radioSelection !== 'custom'}
        error={getPlatformError()}
      />

      <InputText
        id="submitUrl"
        label={lang('Submit URL')}
        value={submitUrl}
        onChange={handleCustomChange}
        disabled={radioSelection !== 'custom'}
        inputMode="url"
        // error={getPlatformError()}
      />
    </Modal>
  );
};

export default memo(ExtPlatformSettings);
