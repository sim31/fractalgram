import type { FC } from '../../../lib/teact/teact';
import React, {
  memo,
} from '../../../lib/teact/teact';

import useLang from '../../../hooks/useLang';

import Button from '../../ui/Button';
import Modal from '../../ui/Modal';
import Spinner from '../../ui/Spinner';

import './LoadingModal.scss';

export type OwnProps = {
  isOpen: boolean;
  title: string;
  onClear: () => void;
};

const LoadingModal: FC<OwnProps> = ({
  isOpen, title, onClear,
}) => {
  const lang = useLang();

  // TODO: How to allow canceling
  function renderHeader() {
    return (
      <div className="modal-header-condensed">
        <Button round color="translucent" size="smaller" ariaLabel="Cancel" onClick={onClear}>
          <i className="icon icon-close" />
        </Button>
        <div className="modal-title">{lang(title)}</div>
      </div>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={onClear} header={renderHeader()} className="LoadingModal">
      <Spinner className="spinner" backgroundColor="light" />
    </Modal>
  );
};

export default memo(LoadingModal);
