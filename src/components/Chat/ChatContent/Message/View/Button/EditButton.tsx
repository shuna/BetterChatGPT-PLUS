import React, { memo } from 'react';

import EditIcon2 from '@icon/EditIcon2';

import BaseButton from './BaseButton';

const EditButton = memo(
  ({
    setIsEdit,
    disabled,
  }: {
    setIsEdit: React.Dispatch<React.SetStateAction<boolean>>;
    disabled?: boolean;
  }) => {
    return (
      <BaseButton
        icon={<EditIcon2 />}
        buttonProps={{ 'aria-label': 'edit message', disabled }}
        onClick={() => setIsEdit(true)}
      />
    );
  }
);

export default EditButton;
