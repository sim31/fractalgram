import type { FC } from '../../../lib/teact/teact';
import React, { memo } from '../../../lib/teact/teact';
import type { OwnProps } from './ContextMenuContainer';
// eslint-disable-next-line import/no-cycle
import { Bundles } from '../../../util/moduleLoader';

import useModuleLoader from '../../../hooks/useModuleLoader';

const ContextMenuContainerAsync: FC<OwnProps> = (props) => {
  const { isOpen } = props;
  const ContextMenuContainer = useModuleLoader(Bundles.Extra, 'ContextMenuContainer', !isOpen);

  // eslint-disable-next-line react/jsx-props-no-spreading
  return ContextMenuContainer ? <ContextMenuContainer {...props} /> : undefined;
};

export default memo(ContextMenuContainerAsync);
