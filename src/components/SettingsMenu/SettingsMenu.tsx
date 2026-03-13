import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useStore from '@store/store';

import PopupModal from '@components/PopupModal';
import SettingIcon from '@icon/SettingIcon';
import ThemeSwitcher from '@components/Menu/MenuOptions/ThemeSwitcher';
import LanguageSelector from '@components/LanguageSelector';
import AutoTitleToggle from './AutoTitleToggle';
import AdvancedModeToggle from './AdvencedModeToggle';
import InlineLatexToggle from './InlineLatexToggle';
import PromptLibraryMenu from '@components/PromptLibraryMenu';
import ChatConfigMenu from '@components/ChatConfigMenu';
import EnterToSubmitToggle from './EnterToSubmitToggle';
import AutoScrollToggle from './AutoScrollToggle';
import HideShareGPTToggle from './HideShareGPTToggle';
import TotalTokenCost, { TotalTokenCostToggle } from './TotalTokenCost';
import ClearConversation from '@components/Menu/MenuOptions/ClearConversation';
import DisplayChatSizeToggle from './DisplayChatSizeToggle';
import ProviderMenuButton from './ProviderMenuButton';
import StreamingMarkdownPolicySelect from './StreamingMarkdownPolicySelect';

const SettingsMenu = () => {
  const { t } = useTranslation();

  const theme = useStore.getState().theme;
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  useEffect(() => {
    document.documentElement.className = theme;
  }, [theme]);

  return (
    <>
      <a
        className='flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm text-gray-700 transition-colors duration-200 hover:bg-gray-100 dark:text-white dark:hover:bg-gray-500/10'
        onClick={() => {
          setIsModalOpen(true);
        }}
      >
        <SettingIcon className='w-4 h-4' /> {t('setting') as string}
      </a>
      {isModalOpen && (
        <PopupModal
          setIsModalOpen={setIsModalOpen}
          title={t('setting') as string}
          cancelButton={false}
        >
          <div className='p-6 border-b border-gray-200 dark:border-gray-600 flex flex-col items-center gap-4'>
            <LanguageSelector />
            <ThemeSwitcher />
            <div className='flex flex-col gap-3'>
              <AutoTitleToggle />
              <EnterToSubmitToggle />
              <AutoScrollToggle />
              <InlineLatexToggle />
              <StreamingMarkdownPolicySelect />
              <AdvancedModeToggle />
              <TotalTokenCostToggle />
              <DisplayChatSizeToggle />
              <HideShareGPTToggle />
            </div>
            <ClearConversation />
            <PromptLibraryMenu />
            <ChatConfigMenu />
            <TotalTokenCost />
            <ProviderMenuButton />
          </div>
        </PopupModal>
      )}
    </>
  );
};

export default SettingsMenu;
