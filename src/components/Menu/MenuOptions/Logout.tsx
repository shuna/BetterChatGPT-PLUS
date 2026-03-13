import React from 'react';
import LogoutIcon from '@icon/LogoutIcon';

const Logout = () => {
  return (
    <a className='flex cursor-pointer items-center gap-3 rounded-md px-3 py-3 text-sm text-gray-700 transition-colors duration-200 hover:bg-gray-100 dark:text-white dark:hover:bg-gray-500/10'>
      <LogoutIcon />
      Log out
    </a>
  );
};

export default Logout;
