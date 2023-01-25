import type { ChangeEvent } from 'react';
import type { ExtPlatformInfo } from '../../../global/types';
import useLang from '../../../hooks/useLang';
import type { FC } from '../../../lib/teact/teact';
import React, {
  memo, useCallback, useMemo,
} from '../../../lib/teact/teact';
import RadioGroup from '../../ui/RadioGroup';
import type { IRadioOption } from '../../ui/RadioGroup';
import InputText from '../../ui/InputText';

export type OwnProps = {
  options: Record<string, ExtPlatformInfo>;
  selection?: ExtPlatformInfo;
  onChange: (selection?: ExtPlatformInfo) => void;
};

const ExtPlatformSettings: FC<OwnProps> = ({
  options, selection, onChange,
}) => {
  const lang = useLang();

  const radioSelection = useMemo(() => {
    if (!selection) {
      return 'none';
    } else {
      const matchingInfo = options[selection.fractalName];
      if (matchingInfo?.platform === selection.platform
          && matchingInfo?.submitUrl === selection.submitUrl) {
        return selection.fractalName;
      }
    }

    return 'custom';
  }, [selection, options]);

  const handleExtPlatformChange = useCallback((newSelection: string) => {
    if (newSelection === 'none') {
      onChange(undefined);
    } else if (newSelection === 'custom') {
      onChange({
        fractalName: 'custom',
        platform: '',
        submitUrl: 'https://',
      });
    } else {
      onChange(options[newSelection]);
    }
  }, [onChange, options]);

  const handleCustomChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.currentTarget;
    if (!selection) {
      // This should never happen
      return;
    }
    onChange({ ...selection, [id]: value });
  }, [onChange, selection]);

  const radioOptions = useMemo(() => {
    const roptions = new Array<IRadioOption>();
    roptions.push({ label: 'None', value: 'none' });
    const preset = Object.values(options).map((info) => {
      return {
        label: info.fractalName,
        subLabel: `platform: ${info.platform}, url: ${info.submitUrl}`,
        value: info.fractalName,
      };
    });
    roptions.push(...preset);
    roptions.push({ label: 'Custom', value: 'custom' });

    return roptions;
  }, [options]);

  const platform = useMemo(() => {
    if (!selection) {
      return '';
    } else {
      return selection.platform;
    }
  }, [selection]);

  const submitUrl = useMemo(() => {
    if (!selection) {
      return 'https://';
    } else {
      return selection.submitUrl;
    }
  }, [selection]);

  return (
    <div>
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
        // error={getPlatformError()}
      />

      <InputText
        id="submitUrl"
        label={lang('Submit URL')}
        value={submitUrl}
        onChange={handleCustomChange}
        disabled={radioSelection !== 'custom'}
        // error={getPlatformError()}
      />
    </div>
  );
};

export default memo(ExtPlatformSettings);
