import React from 'react';
import useStore from '@store/store';

import Chat from '@components/Chat';
import Menu from '@components/Menu';

import useStreamRecovery from '@hooks/useStreamRecovery';
import useIosStatusBarScroll from '@hooks/useIosStatusBarScroll';
import useAppBootstrap from '@hooks/useAppBootstrap';
import Toast from '@components/Toast';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import VersionInfo from '@components/Footer/VersionInfo';
import LegacyCustomModelsBanner from '@components/LegacyCustomModelsBanner';
import OnboardingModal from '@components/Onboarding/OnboardingModal';

function App() {
  const isBootstrapped = useAppBootstrap();
  useStreamRecovery();
  useIosStatusBarScroll();

  if (!isBootstrapped) {
    return <div className='h-full w-full bg-white dark:bg-gray-900' />;
  }

  return (
    <div className='overflow-hidden w-full h-full relative'>
      <OnboardingModal />
      <LegacyCustomModelsBanner />
      <Menu />
      <div className={`flex h-full flex-1 flex-col`}>
        <Chat />
        <Toast />
        <ToastContainer />
        <VersionInfo />
      </div>
    </div>
  );
}

export default App;
