import React, {
  memo, useMemo, useCallback, useEffect,
} from '../../../lib/teact/teact';

import type { FC } from '../../../lib/teact/teact';
import type { ActionPayloads, GlobalState } from '../../../global/types';
import type { ApiAttachMenuPeerType } from '../../../api/types';
import type { ISettings } from '../../../types';

import { CONTENT_TYPES_WITH_PREVIEW, DEFAULT_CONSENSUS_SUBMIT_URL } from '../../../config';
import type { Rank } from '../../../config';
import { IS_TOUCH_ENV } from '../../../util/environment';
import { openSystemFilesDialog } from '../../../util/systemFilesDialog';

import useMouseInside from '../../../hooks/useMouseInside';
import useLang from '../../../hooks/useLang';
import useFlag from '../../../hooks/useFlag';

import ResponsiveHoverButton from '../../ui/ResponsiveHoverButton';
import Menu from '../../ui/Menu';
import MenuItem from '../../ui/MenuItem';
import AttachBotItem from './AttachBotItem';

import './AttachMenu.scss';

export type OwnProps = {
  chatId: string;
  isButtonVisible: boolean;
  canAttachMedia: boolean;
  canAttachPolls: boolean;
  canAttachDelegatePolls: boolean;
  canAttachRankingPolls: { [r in Rank]: boolean };
  canAttachAccountPrompts: boolean;
  canAttachResultReport: boolean;
  isScheduled?: boolean;
  attachBots: GlobalState['attachMenu']['bots'];
  peerType?: ApiAttachMenuPeerType;
  onFileSelect: (files: File[], isQuick: boolean) => void;
  onPollCreate: () => void;
  onConsensusMsg: (payload: ActionPayloads['composeConsensusMessage']) => void;
  theme: ISettings['theme'];
};

const AttachMenu: FC<OwnProps> = ({
  chatId,
  isButtonVisible,
  canAttachMedia,
  canAttachPolls,
  canAttachDelegatePolls,
  canAttachRankingPolls,
  canAttachResultReport,
  canAttachAccountPrompts,
  attachBots,
  peerType,
  isScheduled,
  onFileSelect,
  onPollCreate,
  onConsensusMsg,
  theme,
}) => {
  const [isAttachMenuOpen, openAttachMenu, closeAttachMenu] = useFlag();
  const [handleMouseEnter, handleMouseLeave, markMouseInside] = useMouseInside(isAttachMenuOpen, closeAttachMenu);

  const [isAttachmentBotMenuOpen, markAttachmentBotMenuOpen, unmarkAttachmentBotMenuOpen] = useFlag();
  useEffect(() => {
    if (isAttachMenuOpen) {
      markMouseInside();
    }
  }, [isAttachMenuOpen, markMouseInside]);

  const handleToggleAttachMenu = useCallback(() => {
    if (isAttachMenuOpen) {
      closeAttachMenu();
    } else {
      openAttachMenu();
    }
  }, [isAttachMenuOpen, openAttachMenu, closeAttachMenu]);

  const handleFileSelect = useCallback((e: Event, isQuick: boolean) => {
    const { files } = e.target as HTMLInputElement;

    if (files && files.length > 0) {
      onFileSelect(Array.from(files), isQuick);
    }
  }, [onFileSelect]);

  const handleQuickSelect = useCallback(() => {
    openSystemFilesDialog(
      Array.from(CONTENT_TYPES_WITH_PREVIEW).join(','),
      (e) => handleFileSelect(e, true),
    );
  }, [handleFileSelect]);

  const handleDocumentSelect = useCallback(() => {
    openSystemFilesDialog('*', (e) => handleFileSelect(e, false));
  }, [handleFileSelect]);

  const handleDelegatePoll = useCallback(() => {
    onConsensusMsg({ type: 'delegatePoll' });
  }, [onConsensusMsg]);

  const handleRankingPoll = useCallback((rank: Rank) => {
    onConsensusMsg({ type: 'rankingsPoll', rank });
  }, [onConsensusMsg]);

  const handleAccountPrompt = useCallback(() => {
    onConsensusMsg({ type: 'accountPrompt' });
  }, [onConsensusMsg]);

  const handleResultReport = useCallback(() => {
    onConsensusMsg({ type: 'resultsReport', platform: 'eos', submissionUrl: DEFAULT_CONSENSUS_SUBMIT_URL });
  }, [onConsensusMsg]);

  const bots = useMemo(() => {
    return Object.values(attachBots).filter((bot) => {
      if (!peerType) return false;
      if (peerType === 'bots' && bot.id === chatId && bot.peerTypes.includes('self')) {
        return true;
      }
      return bot.peerTypes.includes(peerType);
    });
  }, [attachBots, chatId, peerType]);

  const lang = useLang();

  if (!isButtonVisible) {
    return undefined;
  }

  function renderRankingPoll(rank: Rank) {
    return (
      // eslint-disable-next-line react/jsx-no-bind
      <MenuItem icon="poll" onClick={() => handleRankingPoll(rank)}>
        {lang(`Level ${rank} poll`)}
      </MenuItem>
    );
  }

  return (
    <div className="AttachMenu">
      <ResponsiveHoverButton
        id="attach-menu-button"
        className={isAttachMenuOpen ? 'AttachMenu--button activated' : 'AttachMenu--button'}
        round
        color="translucent"
        onActivate={handleToggleAttachMenu}
        ariaLabel="Add an attachment"
        ariaControls="attach-menu-controls"
        hasPopup
      >
        <i className="icon-attach" />
      </ResponsiveHoverButton>
      <Menu
        id="attach-menu-controls"
        isOpen={isAttachMenuOpen || isAttachmentBotMenuOpen}
        autoClose
        positionX="right"
        positionY="bottom"
        onClose={closeAttachMenu}
        className="AttachMenu--menu fluid"
        onCloseAnimationEnd={closeAttachMenu}
        onMouseEnter={!IS_TOUCH_ENV ? handleMouseEnter : undefined}
        onMouseLeave={!IS_TOUCH_ENV ? handleMouseLeave : undefined}
        noCloseOnBackdrop={!IS_TOUCH_ENV}
        ariaLabelledBy="attach-menu-button"
      >
        {/*
       ** Using ternary operator here causes some attributes from first clause
       ** transferring to the fragment content in the second clause
       */}
        {!canAttachMedia && (
          <MenuItem className="media-disabled" disabled>Posting media content is not allowed in this group.</MenuItem>
        )}
        {canAttachMedia && (
          <>
            <MenuItem icon="photo" onClick={handleQuickSelect}>{lang('AttachmentMenu.PhotoOrVideo')}</MenuItem>
            <MenuItem icon="document" onClick={handleDocumentSelect}>{lang('AttachDocument')}</MenuItem>
          </>
        )}
        {canAttachPolls && (
          <MenuItem icon="poll" onClick={onPollCreate}>{lang('Poll')}</MenuItem>
        )}

        {canAttachMedia && !isScheduled && bots.map((bot) => (
          <AttachBotItem
            bot={bot}
            chatId={chatId}
            theme={theme}
            onMenuOpened={markAttachmentBotMenuOpen}
            onMenuClosed={unmarkAttachmentBotMenuOpen}
          />
        ))}

        {canAttachAccountPrompts && (
          <MenuItem icon="poll" onClick={handleAccountPrompt}>
            {lang('Account prompt')}
          </MenuItem>
        )}

        {canAttachPolls && canAttachRankingPolls[6] && renderRankingPoll(6) }
        {canAttachPolls && canAttachRankingPolls[5] && renderRankingPoll(5) }
        {canAttachPolls && canAttachRankingPolls[4] && renderRankingPoll(4) }
        {canAttachPolls && canAttachRankingPolls[3] && renderRankingPoll(3) }
        {canAttachPolls && canAttachRankingPolls[2] && renderRankingPoll(2) }
        {canAttachPolls && canAttachRankingPolls[1] && renderRankingPoll(1) }

        {canAttachPolls && canAttachDelegatePolls && (
          <MenuItem icon="poll" onClick={handleDelegatePoll}>
            {lang('Delegate poll')}
          </MenuItem>
        )}

        {canAttachResultReport && (
          <MenuItem icon="poll" onClick={handleResultReport}>
            {lang('Consensus results')}
          </MenuItem>
        )}

      </Menu>
    </div>
  );
};

export default memo(AttachMenu);
