import './util/handleError';
import './util/setupServiceWorker';

// @ts-ignore
import { UALProvider } from 'ual-reactjs-renderer';
import { Anchor } from 'ual-anchor';

import React from './lib/teact/teact';
import TeactDOM from './lib/teact/teact-dom';

import { getActions, getGlobal } from './global';
import updateWebmanifest from './util/updateWebmanifest';
import { setupBeforeInstallPrompt } from './util/installPrompt';
import { IS_INSTALL_PROMPT_SUPPORTED } from './util/environment';
import './global/init';

import { DEBUG } from './config';

import App from './App';

import './styles/index.scss';

if (DEBUG) {
  // eslint-disable-next-line no-console
  console.log('>>> INIT');
}

if (IS_INSTALL_PROMPT_SUPPORTED) {
  setupBeforeInstallPrompt();
}
getActions().init();

if (DEBUG) {
  // eslint-disable-next-line no-console
  console.log('>>> START INITIAL RENDER');
}

updateWebmanifest();

const chain = {
  chainId: 'aca376f206b8fc25a6ed44dbdc66547c36c6c33e3a119ffbeaef943642f0e906',
  rpcEndpoints: [
    {
      protocol: 'https',
      host: 'eos.greymass.com',
      port: 443,
    },
  ],
};

const appName = 'Fractal telegram-tt';

const anchor = new Anchor([chain], {
  appName,
});

const supportedChains = [chain];
const supportedAuthenticators = [
  anchor,
];

TeactDOM.render(
  (
    <UALProvider
      chains={supportedChains}
      authenticators={supportedAuthenticators}
      appName={appName}
    >
      <App />,
    </UALProvider>

  ),
  document.getElementById('root')!,
);

if (DEBUG) {
  // eslint-disable-next-line no-console
  console.log('>>> FINISH INITIAL RENDER');
}

if (DEBUG) {
  document.addEventListener('dblclick', () => {
    // eslint-disable-next-line no-console
    console.warn('GLOBAL STATE', getGlobal());
  });
}
