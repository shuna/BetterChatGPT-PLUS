import React from 'react';
import PersonIcon from '@icon/PersonIcon';

const Account = () => {
  return (
    <a className='flex cursor-pointer items-center gap-3 rounded-md px-3 py-3 text-sm text-gray-700 transition-colors duration-200 hover:bg-gray-100 dark:text-white dark:hover:bg-gray-500/10'>
      <PersonIcon />
      My account
    </a>
  );
};

export default Account;
