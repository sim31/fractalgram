import type { FC } from '../../../lib/teact/teact';
import React, {
  memo, useCallback, useEffect,
  useMemo,
} from '../../../lib/teact/teact';

import type { ApiAttachMenuPeerType } from '../../../api/types';
import type { ActionPayloads, GlobalState } from '../../../global/types';
import type { ISettings } from '../../../types';

import {
  CONTENT_TYPES_WITH_PREVIEW, DEBUG_LOG_FILENAME, type Rank, SUPPORTED_AUDIO_CONTENT_TYPES,
  SUPPORTED_IMAGE_CONTENT_TYPES,
  SUPPORTED_VIDEO_CONTENT_TYPES,
} from '../../../config';
import { getDebugLogs } from '../../../util/debugConsole';
import { validateFiles } from '../../../util/files';
import { openSystemFilesDialog } from '../../../util/systemFilesDialog';
import { IS_TOUCH_ENV } from '../../../util/windowEnvironment';

import useFlag from '../../../hooks/useFlag';
import useLang from '../../../hooks/useLang';
import useLastCallback from '../../../hooks/useLastCallback';
import useMouseInside from '../../../hooks/useMouseInside';

import Menu from '../../ui/Menu';
import MenuItem from '../../ui/MenuItem';
import ResponsiveHoverButton from '../../ui/ResponsiveHoverButton';
import AttachBotItem from './AttachBotItem';

import './AttachMenu.scss';

export type OwnProps = {
  chatId: string;
  threadId?: number;
  isButtonVisible: boolean;
  canAttachMedia: boolean;
  canAttachPolls: boolean;
  canAttachDelegatePolls: boolean;
  canAttachRankingPolls: { [r in Rank]: boolean };
  canAttachAccountPrompts: boolean;
  canAttachResultReport: boolean;
  canSendPhotos: boolean;
  canSendVideos: boolean;
  canSendDocuments: boolean;
  canSendAudios: boolean;
  isScheduled?: boolean;
  attachBots?: GlobalState['attachMenu']['bots'];
  peerType?: ApiAttachMenuPeerType;
  shouldCollectDebugLogs?: boolean;
  theme: ISettings['theme'];
  onFileSelect: (files: File[], shouldSuggestCompression?: boolean) => void;
  onPollCreate: () => void;
  onMenuOpen: NoneToVoidFunction;
  onMenuClose: NoneToVoidFunction;
  onConsensusMsg: (payload: ActionPayloads['composeConsensusMessage']) => void;
};

const AttachMenu: FC<OwnProps> = ({
  chatId,
  threadId,
  isButtonVisible,
  canAttachMedia,
  canAttachPolls,
  canAttachDelegatePolls,
  canAttachRankingPolls,
  canAttachResultReport,
  canAttachAccountPrompts,
  canSendPhotos,
  canSendVideos,
  canSendDocuments,
  canSendAudios,
  attachBots,
  peerType,
  isScheduled,
  theme,
  shouldCollectDebugLogs,
  onFileSelect,
  onMenuOpen,
  onMenuClose,
  onPollCreate,
  onConsensusMsg,
}) => {
  const [isAttachMenuOpen, openAttachMenu, closeAttachMenu] = useFlag();
  const [handleMouseEnter, handleMouseLeave, markMouseInside] = useMouseInside(isAttachMenuOpen, closeAttachMenu);

  const canSendVideoAndPhoto = canSendPhotos && canSendVideos;
  const canSendVideoOrPhoto = canSendPhotos || canSendVideos;

  const [isAttachmentBotMenuOpen, markAttachmentBotMenuOpen, unmarkAttachmentBotMenuOpen] = useFlag();
  const isMenuOpen = isAttachMenuOpen || isAttachmentBotMenuOpen;

  useEffect(() => {
    if (isAttachMenuOpen) {
      markMouseInside();
    }
  }, [isAttachMenuOpen, markMouseInside]);

  useEffect(() => {
    if (isMenuOpen) {
      onMenuOpen();
    } else {
      onMenuClose();
    }
  }, [isMenuOpen, onMenuClose, onMenuOpen]);

  const handleToggleAttachMenu = useLastCallback(() => {
    if (isAttachMenuOpen) {
      closeAttachMenu();
    } else {
      openAttachMenu();
    }
  });

  const handleFileSelect = useLastCallback((e: Event, shouldSuggestCompression?: boolean) => {
    const { files } = e.target as HTMLInputElement;
    const validatedFiles = validateFiles(files);

    if (validatedFiles?.length) {
      onFileSelect(validatedFiles, shouldSuggestCompression);
    }
  });

  const handleQuickSelect = useLastCallback(() => {
    openSystemFilesDialog(
      Array.from(canSendVideoAndPhoto ? CONTENT_TYPES_WITH_PREVIEW : (
        canSendPhotos ? SUPPORTED_IMAGE_CONTENT_TYPES : SUPPORTED_VIDEO_CONTENT_TYPES
      )).join(','),
      (e) => handleFileSelect(e, true),
    );
  });

  const handleDocumentSelect = useLastCallback(() => {
    openSystemFilesDialog(!canSendDocuments && canSendAudios
      ? Array.from(SUPPORTED_AUDIO_CONTENT_TYPES).join(',') : (
        '*'
      ), (e) => handleFileSelect(e, false));
  });

  const handleSendLogs = useLastCallback(() => {
    const file = new File([getDebugLogs()], DEBUG_LOG_FILENAME, { type: 'text/plain' });
    onFileSelect([file]);
  });

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
    onConsensusMsg({ type: 'resultsReport' });
  }, [onConsensusMsg]);

  const bots = useMemo(() => {
    return attachBots
      ? Object.values(attachBots).filter((bot) => {
        if (!peerType || !bot.isForAttachMenu) return false;
        if (peerType === 'bots' && bot.id === chatId && bot.attachMenuPeerTypes.includes('self')) {
          return true;
        }
        return bot.attachMenuPeerTypes!.includes(peerType);
      })
      : undefined;
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
        <i className="icon icon-attach" />
      </ResponsiveHoverButton>
      <Menu
        id="attach-menu-controls"
        isOpen={isMenuOpen}
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
            {canSendVideoOrPhoto && (
              <MenuItem icon="photo" onClick={handleQuickSelect}>
                {lang(canSendVideoAndPhoto ? 'AttachmentMenu.PhotoOrVideo'
                  : (canSendPhotos ? 'InputAttach.Popover.Photo' : 'InputAttach.Popover.Video'))}
              </MenuItem>
            )}
            {(canSendDocuments || canSendAudios)
              && (
                <MenuItem icon="document" onClick={handleDocumentSelect}>
                  {lang(!canSendDocuments && canSendAudios ? 'InputAttach.Popover.Music' : 'AttachDocument')}
                </MenuItem>
              )}
            {canSendDocuments && shouldCollectDebugLogs && (
              <MenuItem icon="bug" onClick={handleSendLogs}>
                {lang('DebugSendLogs')}
              </MenuItem>
            )}
          </>
        )}
        {canAttachPolls && (
          <MenuItem icon="poll" onClick={onPollCreate}>{lang('Poll')}</MenuItem>
        )}

        {canAttachMedia && !isScheduled && bots?.map((bot) => (
          <AttachBotItem
            bot={bot}
            chatId={chatId}
            threadId={threadId}
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
