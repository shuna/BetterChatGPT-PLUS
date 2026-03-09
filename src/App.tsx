import React from 'react';
import useStore from '@store/store';

import Chat from '@components/Chat';
import Menu from '@components/Menu';

import useStreamRecovery from '@hooks/useStreamRecovery';
import useIosStatusBarScroll from '@hooks/useIosStatusBarScroll';
import useAppBootstrap from '@hooks/useAppBootstrap';
import ApiPopup from '@components/ApiPopup';
import Toast from '@components/Toast';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import VersionInfo from '@components/Footer/VersionInfo';
import LegacyCustomModelsBanner from '@components/LegacyCustomModelsBanner';

function App() {
  useAppBootstrap();
  useStreamRecovery();
  useIosStatusBarScroll();

  return (
    <div className='overflow-hidden w-full h-full relative'>
      <LegacyCustomModelsBanner />
      <Menu />
      <div className={`flex h-full flex-1 flex-col`}>
        <Chat />
        <ApiPopup />
        <Toast />
        <ToastContainer />
        <VersionInfo />
      </div>
    </div>
  );
}

export default App;
