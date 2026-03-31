import React, { memo } from 'react';

import DeleteIcon from '@icon/DeleteIcon';

import BaseButton from './BaseButton';

const DeleteButton = memo(
  ({
    setIsDelete,
    disabled,
  }: {
    setIsDelete: React.Dispatch<React.SetStateAction<boolean>>;
    disabled?: boolean;
  }) => {
    return (
      <BaseButton
        icon={<DeleteIcon />}
        buttonProps={{ 'aria-label': 'delete message', disabled }}
        onClick={() => setIsDelete(true)}
      />
    );
  }
);

export default DeleteButton;
