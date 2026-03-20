import React from 'react';
import useStore from '@store/store';

import Chat from '@components/Chat';
import Menu from '@components/Menu';

import useStreamRecovery from '@hooks/useStreamRecovery';
import useOpenRouterVerification from '@hooks/useOpenRouterVerification';
import useIosStatusBarScroll from '@hooks/useIosStatusBarScroll';
import useAppBootstrap from '@hooks/useAppBootstrap';
import Toast from '@components/Toast';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import VersionInfo from '@components/Footer/VersionInfo';
import LegacyCustomModelsBanner from '@components/LegacyCustomModelsBanner';
import MigrationProgressBanner from '@components/MigrationProgressBanner';
import OnboardingModal from '@components/Onboarding/OnboardingModal';

function App() {
  const isBootstrapped = useAppBootstrap();
  useStreamRecovery();
  useOpenRouterVerification();
  useIosStatusBarScroll();

  if (!isBootstrapped) {
    return <div className='h-full w-full bg-white dark:bg-gray-900' />;
  }

  // Remove boot status indicator once app is ready
  document.getElementById('boot-status')?.remove();

  return (
    <div className='overflow-hidden w-full h-full relative'>
      <OnboardingModal />
      <LegacyCustomModelsBanner />
      <MigrationProgressBanner />
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
