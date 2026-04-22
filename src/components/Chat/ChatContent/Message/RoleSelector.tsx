import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import useStore from '@store/store';

import DownChevronArrow from '@icon/DownChevronArrow';
import { Role, roles } from '@type/chat';

import useHideOnOutsideClick from '@hooks/useHideOnOutsideClick';

type RoleSelectorProps =
  | { role: Role; sticky: true; nodeId?: undefined; messageIndex?: undefined; allowSystem?: boolean }
  | { role: Role; sticky?: false; nodeId: string; messageIndex: number; allowSystem?: boolean };

const RoleSelector = React.memo(
  (props: RoleSelectorProps) => {
    const { role, sticky, nodeId, messageIndex, allowSystem = false } = props;
    const { t } = useTranslation();
    const setInputRole = useStore((state) => state.setInputRole);
    const updateNodeRole = useStore((state) => state.updateNodeRole);
    const currentChatIndex = useStore((state) => state.currentChatIndex);

    const [dropDown, setDropDown, dropDownRef] = useHideOnOutsideClick();

    const availableRoles = allowSystem ? roles : roles.filter((r) => r !== 'system');

    return (
      <div className='prose dark:prose-invert relative'>
        <button
          className='btn btn-neutral btn-small flex gap-1'
          aria-label={t(role) as string}
          type='button'
          onClick={() => setDropDown((prev) => !prev)}
        >
          {t(role)}
          <DownChevronArrow />
        </button>
        <div
          ref={dropDownRef}
          id='dropdown'
          className={`${
            dropDown ? '' : 'hidden'
          } absolute top-100 bottom-100 z-10 bg-white rounded-lg shadow-xl border-b border-black/10 dark:border-gray-900/50 text-gray-800 dark:text-gray-100 group dark:bg-gray-800 opacity-90 whitespace-nowrap`}
        >
          <ul
            className='text-sm text-gray-700 dark:text-gray-200 p-0 m-0'
            aria-labelledby='dropdownDefaultButton'
          >
            {availableRoles.map((r) => (
              <li
                className='px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 dark:hover:text-white cursor-pointer'
                onClick={() => {
                  if (sticky) {
                    setInputRole(r);
                  } else {
                    if (!nodeId) return;
                    updateNodeRole(currentChatIndex, nodeId, r);
                  }
                  setDropDown(false);
                }}
                key={r}
              >
                {t(r)}
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }
);
export default RoleSelector;
