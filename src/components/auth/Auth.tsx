import type { FC } from '../../lib/teact/teact';
import React, { useEffect, memo } from '../../lib/teact/teact';
import { getActions, withGlobal } from '../../global';

import type { GlobalState } from '../../global/types';

import '../../global/actions/initial';
import { pick } from '../../util/iteratees';
import { PLATFORM_ENV } from '../../util/environment';
import windowSize from '../../util/windowSize';
import useCurrentOrPrev from '../../hooks/useCurrentOrPrev';

import Transition from '../ui/Transition';
import AuthCode from './AuthCode.async';
import AuthPassword from './AuthPassword.async';
import AuthRegister from './AuthRegister.async';
import AuthQrCode from './AuthQrCode';

import './Auth.scss';

type OwnProps = {
  isActive: boolean;
};

type StateProps = Pick<GlobalState, 'authState' | 'hasWebAuthTokenPasswordRequired'>;

const Auth: FC<OwnProps & StateProps> = ({
  isActive, authState, hasWebAuthTokenPasswordRequired,
}) => {
  const {
    reset, initApi,
  } = getActions();

  useEffect(() => {
    if (isActive && !hasWebAuthTokenPasswordRequired) {
      reset();
      initApi();
    }
  }, [isActive, reset, initApi, hasWebAuthTokenPasswordRequired]);

  const isMobile = PLATFORM_ENV === 'iOS' || PLATFORM_ENV === 'Android';

  // Prevent refresh when rotating device
  useEffect(() => {
    windowSize.disableRefresh();

    return () => {
      windowSize.enableRefresh();
    };
  }, []);

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
        return <AuthQrCode />;
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

export default memo(withGlobal<OwnProps>(
  (global): StateProps => pick(global, ['authState', 'hasWebAuthTokenPasswordRequired']),
)(Auth));
