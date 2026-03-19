import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useStore from '@store/store';

import PopupModal from '@components/PopupModal';
import SettingIcon from '@icon/SettingIcon';
import { languageCodeToName, selectableLanguages } from '@constants/language';
import { Theme } from '@type/theme';
import AutoTitleToggle from './AutoTitleToggle';
import AdvancedModeToggle from './AdvencedModeToggle';
import InlineLatexToggle from './InlineLatexToggle';
import EnterToSubmitToggle from './EnterToSubmitToggle';
import AnimateBubbleNavigationToggle from './AnimateBubbleNavigationToggle';
import StreamingMarkdownPolicySelect from './StreamingMarkdownPolicySelect';

import TotalTokenCost, { TotalTokenCostToggle } from './TotalTokenCost';
import ClearConversation from '@components/Menu/MenuOptions/ClearConversation';
import DisplayChatSizeToggle from './DisplayChatSizeToggle';
import ShowDebugPanelToggle from './ShowDebugPanelToggle';
import ProviderMenuInline from '@components/ProviderMenu/ProviderMenuInline';
import { ProxySettingsInline } from './ProxySettings';
import { ChatConfigInline } from '@components/ChatConfigMenu/ChatConfigMenu';
import { PromptLibraryInline } from '@components/PromptLibraryMenu/PromptLibraryMenu';
import ImportChat from '@components/ImportExportChat/ImportChat';
import ExportChat from '@components/ImportExportChat/ExportChat';

type TabId = 'general' | 'chatConfig' | 'providers' | 'proxy' | 'prompts' | 'data';

interface TabDef {
  id: TabId;
  labelKey: string;
}

const tabs: TabDef[] = [
  { id: 'general', labelKey: 'settingsTab.general' },
  { id: 'providers', labelKey: 'settingsTab.providers' },
  { id: 'chatConfig', labelKey: 'settingsTab.chatConfig' },
  { id: 'data', labelKey: 'settingsTab.data' },
  { id: 'prompts', labelKey: 'settingsTab.prompts' },
  { id: 'proxy', labelKey: 'settingsTab.proxy' },
];

const ResizableNav = ({
  children,
  minWidth,
  maxWidth,
  defaultWidth,
}: {
  children: React.ReactNode;
  minWidth: number;
  maxWidth: number;
  defaultWidth: number;
}) => {
  const [width, setWidth] = useState(defaultWidth);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startW = useRef(0);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true;
    startX.current = e.clientX;
    startW.current = width;
    e.preventDefault();

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const delta = ev.clientX - startX.current;
      setWidth(Math.min(maxWidth, Math.max(minWidth, startW.current + delta)));
    };
    const onMouseUp = () => {
      dragging.current = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [width, minWidth, maxWidth]);

  return (
    <nav className='relative flex-shrink-0 border-b md:border-b-0 md:border-r border-gray-200 dark:border-gray-600' style={{ width: undefined }}>
      <div className='hidden md:block' style={{ width }}>
        {children}
      </div>
      <div className='md:hidden'>{children}</div>
      {/* Drag handle */}
      <div
        className='hidden md:block absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-blue-400/40 active:bg-blue-400/60 z-10'
        onMouseDown={onMouseDown}
      />
    </nav>
  );
};

const SettingsMenu = () => {
  const { t } = useTranslation();

  const theme = useStore.getState().theme;
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [initialTab, setInitialTab] = useState<TabId>('general');
  const showProviderMenu = useStore((state) => state.showProviderMenu);
  const setShowProviderMenu = useStore((state) => state.setShowProviderMenu);

  useEffect(() => {
    document.documentElement.className = theme;
  }, [theme]);

  useEffect(() => {
    if (showProviderMenu) {
      setInitialTab('providers');
      setIsModalOpen(true);
      setShowProviderMenu(false);
    }
  }, [showProviderMenu, setShowProviderMenu]);

  return (
    <>
      <a
        className='flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm text-gray-700 transition-colors duration-200 hover:bg-gray-100 dark:text-white dark:hover:bg-gray-500/10'
        onClick={() => {
          setInitialTab('general');
          setIsModalOpen(true);
        }}
      >
        <SettingIcon className='w-4 h-4' /> {t('setting') as string}
      </a>
      {isModalOpen && (
        <SettingsDialog setIsModalOpen={setIsModalOpen} initialTab={initialTab} />
      )}
    </>
  );
};

const SettingsDialog = ({
  setIsModalOpen,
  initialTab = 'general',
}: {
  setIsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  initialTab?: TabId;
}) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);

  return (
    <PopupModal
      setIsModalOpen={setIsModalOpen}
      title={t('setting') as string}
      cancelButton={false}
      maxWidth='max-w-4xl'
    >
      <div className='flex flex-col md:flex-row h-[70vh] w-[90vw] max-w-4xl'>
        {/* Sidebar - desktop: vertical, mobile: horizontal scroll */}
        <ResizableNav minWidth={80} maxWidth={200} defaultWidth={120}>
          {/* Mobile: horizontal scroll tab bar */}
          <div className='md:hidden flex overflow-x-auto hide-scroll-bar'>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className={`flex-shrink-0 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors ${
                  activeTab === tab.id
                    ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
                onClick={() => setActiveTab(tab.id)}
              >
                {t(tab.labelKey)}
              </button>
            ))}
          </div>
          {/* Desktop: vertical tab list */}
          <div className='hidden md:flex flex-col py-2'>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className={`text-left px-3 py-2 text-sm font-medium transition-colors truncate ${
                  activeTab === tab.id
                    ? 'bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-white'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
                onClick={() => setActiveTab(tab.id)}
              >
                {t(tab.labelKey)}
              </button>
            ))}
          </div>
        </ResizableNav>

        {/* Content area */}
        <div className='flex-1 overflow-y-auto p-6'>
          {activeTab === 'general' && <GeneralTab />}
          {activeTab === 'chatConfig' && <ChatConfigInline />}
          {activeTab === 'providers' && <ProvidersTab />}
          {activeTab === 'proxy' && <ProxySettingsInline />}
          {activeTab === 'prompts' && <PromptLibraryInline />}
          {activeTab === 'data' && <DataTab />}
        </div>
      </div>
    </PopupModal>
  );
};

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <div className='text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1'>
    {children}
  </div>
);

const SettingsGroup = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <SectionLabel>{label}</SectionLabel>
    <div className='rounded-lg border border-gray-200 dark:border-gray-600 divide-y divide-gray-200 dark:divide-gray-600'>
      {children}
    </div>
  </div>
);

const SettingsRow = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className='flex items-center justify-between gap-4 px-4 py-3'>
    <span className='text-sm font-medium text-gray-900 dark:text-gray-300'>{label}</span>
    <div className='flex-shrink-0'>{children}</div>
  </div>
);

const LanguageSelect = () => {
  const { i18n } = useTranslation();
  return (
    <select
      className='rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300'
      value={i18n.language}
      onChange={(e) => i18n.changeLanguage(e.target.value)}
      aria-label='language selector'
    >
      {selectableLanguages.map((lang) => (
        <option key={lang} value={lang}>
          {languageCodeToName[lang]}
        </option>
      ))}
    </select>
  );
};

const ThemeRadioGroup = () => {
  const { t } = useTranslation();
  const theme = useStore((state) => state.theme);
  const setTheme = useStore((state) => state.setTheme);

  useEffect(() => {
    document.documentElement.className = theme;
  }, [theme]);

  const options: { value: Theme; label: string }[] = [
    { value: 'light', label: t('lightMode') },
    { value: 'dark', label: t('darkMode') },
  ];

  return (
    <div className='flex items-center gap-4'>
      {options.map((opt) => (
        <label key={opt.value} className='flex items-center gap-1.5 cursor-pointer text-sm text-gray-900 dark:text-gray-300'>
          <input
            type='radio'
            name='theme'
            value={opt.value}
            checked={theme === opt.value}
            onChange={() => setTheme(opt.value)}
            className='accent-blue-500'
          />
          {opt.label}
        </label>
      ))}
    </div>
  );
};

const GeneralTab = () => {
  const { t } = useTranslation();
  return (
    <div className='flex flex-col gap-5'>
      <SettingsGroup label={t('settingsSection.appearance')}>
        <SettingsRow label={t('settingsLabel.language')}>
          <LanguageSelect />
        </SettingsRow>
        <SettingsRow label={t('settingsLabel.theme')}>
          <ThemeRadioGroup />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup label={t('settingsSection.input')}>
        <EnterToSubmitToggle />
      </SettingsGroup>

      <SettingsGroup label={t('settingsSection.display')}>
        <AnimateBubbleNavigationToggle />
        <DisplayChatSizeToggle />
        <TotalTokenCostToggle />
        <ShowDebugPanelToggle />
      </SettingsGroup>
      <TotalTokenCost />

      <SettingsGroup label={t('settingsSection.rendering')}>
        <InlineLatexToggle />
        <StreamingMarkdownPolicySelect />
      </SettingsGroup>

      <SettingsGroup label={t('settingsSection.features')}>
        <AutoTitleToggle />
        <AdvancedModeToggle />
      </SettingsGroup>
    </div>
  );
};

const ProvidersTab = () => {
  return <ProviderMenuInline />;
};

const DataTab = () => {
  const { t } = useTranslation();
  return (
    <div className='flex flex-col gap-6'>
      {/* Import */}
      <div className='rounded-lg border border-gray-200 dark:border-gray-600 p-4'>
        <ImportChat />
      </div>

      {/* Export */}
      <div className='rounded-lg border border-gray-200 dark:border-gray-600 p-4'>
        <ExportChat />
      </div>

      {/* Danger zone */}
      <div className='border-t border-gray-200 dark:border-gray-600 pt-4'>
        <SectionLabel>{t('settingsSection.dangerZone')}</SectionLabel>
        <div className='mt-3'>
          <ClearConversation />
        </div>
      </div>
    </div>
  );
};

export default SettingsMenu;
