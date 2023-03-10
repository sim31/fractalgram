import type { FC } from '../../lib/teact/teact';
import React, { memo } from '../../lib/teact/teact';
import { withGlobal } from '../../global';

import type { GlobalState } from '../../global/types';

import '../../global/actions/initial';
import { PLATFORM_ENV } from '../../util/environment';
import useCurrentOrPrev from '../../hooks/useCurrentOrPrev';

import Transition from '../ui/Transition';
import AuthCode from './AuthCode.async';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import AuthPhoneNumber from './AuthPhoneNumber';
import AuthPassword from './AuthPassword.async';
import AuthRegister from './AuthRegister.async';
import AuthQrCode from './AuthQrCode';

import './Auth.scss';

type StateProps = Pick<GlobalState, 'authState'>;

const Auth: FC<StateProps> = ({
  authState,
}) => {
  const isMobile = PLATFORM_ENV === 'iOS' || PLATFORM_ENV === 'Android';

  // For animation purposes
  const renderingAuthState = useCurrentOrPrev(
    authState !== 'authorizationStateReady' ? authState : undefined,
    true,
  );

  function getScreen() {
    switch (renderingAuthState) {
      case 'authorizationStateWaitCode':
        return <AuthCode />;
      case 'authorizationStateWaitPassword':
        return <AuthPassword />;
      case 'authorizationStateWaitRegistration':
        return <AuthRegister />;
      case 'authorizationStateWaitQrCode':
        return <AuthQrCode />;
      default:
        // Hack to avoid a bug where clicks are triggered on hidden elements
        // eslint-disable-next-line no-constant-condition
        return true ? <AuthQrCode /> : <AuthPhoneNumber />;
    }
  }

  function getActiveKey() {
    switch (renderingAuthState) {
      case 'authorizationStateWaitCode':
        return 0;
      case 'authorizationStateWaitPassword':
        return 1;
      case 'authorizationStateWaitRegistration':
        return 2;
      case 'authorizationStateWaitPhoneNumber':
        return 3;
      case 'authorizationStateWaitQrCode':
        return 4;
      default:
        return isMobile ? 3 : 4;
    }
  }

  return (
    <Transition activeKey={getActiveKey()} name="fade" className="Auth">
      {getScreen()}
    </Transition>
  );
};

export default memo(withGlobal(
  (global): StateProps => {
    return {
      authState: global.authState,
    };
  },
)(Auth));
