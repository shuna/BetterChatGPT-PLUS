import React, { memo } from 'react';
import { useTranslation } from 'react-i18next';
import useStore from '@store/store';
import { ContentInterface, isImageContent } from '@type/chat';
import { ModelOptions } from '@type/chat';
import type { ProviderId } from '@type/provider';
import { useModelType } from '@utils/modelLookup';
import { hasMeaningfulContent } from '@utils/contentValidation';
import useHideOnOutsideClick from '@hooks/useHideOnOutsideClick';
import AttachmentIcon from '@icon/AttachmentIcon';
import DownChevronArrow from '@icon/DownChevronArrow';
import CommandPrompt from '../CommandPrompt';

const EditViewButtons = memo(
  ({
    sticky = false,
    handleFileChange,
    handleImageDetailChange,
    handleRemoveImage,
    handleGenerate,
    handleGenerateNextOnly,
    handleSave,
    handleCancel,
    handleUploadButtonClick,
    setIsModalOpen,
    _setContent,
    _content,
    imageUrl,
    setImageUrl,
    handleImageUrlChange,
    fileInputRef,
    model,
    providerId,
    modelValid,
    messageIndex,
    role,
  }: {
    sticky?: boolean;
    handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    handleImageDetailChange: (index: number, e: string) => void;
    handleRemoveImage: (index: number) => void;
    handleGenerate: () => void;
    handleGenerateNextOnly: () => void;
    handleSave: () => void;
    handleCancel: () => void;
    handleUploadButtonClick: () => void;
    setIsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
    _setContent: React.Dispatch<React.SetStateAction<ContentInterface[]>>;
    _content: ContentInterface[];
    imageUrl: string;
    setImageUrl: React.Dispatch<React.SetStateAction<string>>;
    handleImageUrlChange: () => void;
    fileInputRef: React.MutableRefObject<HTMLInputElement | null>;
    model: ModelOptions;
    providerId?: ProviderId;
    modelValid: boolean;
    messageIndex: number;
    role?: string;
  }) => {
    const { t } = useTranslation();
    const isCurrentChatGenerating = useStore((state) => {
      const chatId = state.chats?.[state.currentChatIndex]?.id ?? '';
      return Object.values(state.generatingSessions).some((s) => s.chatId === chatId);
    });
    const noModel = !modelValid;
    const lastMessageIndex = useStore((state) =>
      state.chats?.[state.currentChatIndex]?.messages.length
        ? state.chats[state.currentChatIndex].messages.length - 1
        : 0
    );
    const isImageModel = useModelType(model, providerId) === 'image';
    const isAssistant = role === 'assistant';
    const isUser = role === 'user';
    const isNotLast = !sticky && messageIndex < lastMessageIndex;
    const canSubmitDraft = hasMeaningfulContent(_content);
    const [attachDropDown, setAttachDropDown, attachDropDownRef] = useHideOnOutsideClick();
    const [generateMenuOpen, setGenerateMenuOpen, generateMenuRef] = useHideOnOutsideClick();

    const wrapperClass = sticky
      ? 'w-full min-h-[3rem]'
      : 'mt-2.5 flex min-h-[2.75rem] items-center';
    const controlsRowClass = sticky
      ? 'flex items-center mt-1'
      : 'flex w-full items-center';

    return (
      <div className={wrapperClass}>
        {isImageModel && (
          <>
            <div className='flex justify-center'>
              <div className='flex gap-5'>
                {_content.slice(1).filter(isImageContent).map((image, index) => (
                  <div
                    key={index}
                    className='image-container flex flex-col gap-2'
                  >
                    <img
                      src={image.image_url.url}
                      alt={`uploaded-${index}`}
                      className='h-10'
                    />
                    <div className='flex flex-row gap-3'>
                      <select
                        onChange={(event) =>
                          handleImageDetailChange(index, event.target.value)
                        }
                        title='Select image resolution'
                        aria-label='Select image resolution'
                        defaultValue={image.image_url.detail}
                        style={{ color: 'black' }}
                      >
                        <option value='auto'>Auto</option>
                        <option value='high'>High</option>
                        <option value='low'>Low</option>
                      </select>
                      <button
                        className='close-button'
                        onClick={() => handleRemoveImage(index)}
                        aria-label='Remove Image'
                      >
                        &times;
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <input
              type='file'
              ref={fileInputRef}
              style={{ display: 'none' }}
              onChange={handleFileChange}
              multiple
            />
          </>
        )}

        <div className={controlsRowClass}>
          <div className='flex items-center gap-1'>
            {isImageModel && (
              <div className='relative' ref={attachDropDownRef}>
                <button
                  className='btn btn-neutral btn-small'
                  onClick={() => setAttachDropDown(!attachDropDown)}
                  aria-label='Attach files'
                >
                  <AttachmentIcon />
                </button>
                <div
                  className={`${
                    attachDropDown ? '' : 'hidden'
                  } absolute bottom-full left-0 mb-1 z-10 bg-white rounded-lg shadow-xl border-b border-black/10 dark:border-gray-900/50 text-gray-800 dark:text-gray-100 dark:bg-gray-800 opacity-90 w-max`}
                >
                  <button
                    className='px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 dark:hover:text-white cursor-pointer text-start w-full text-sm'
                    onClick={() => {
                      handleUploadButtonClick();
                      setAttachDropDown(false);
                    }}
                  >
                    {t('selectFile') as string}
                  </button>
                  <div className='px-4 py-2 flex items-center gap-2'>
                    <input
                      type='text'
                      value={imageUrl}
                      onChange={(e) => setImageUrl(e.target.value)}
                      placeholder={t('enter_image_url_placeholder') as string}
                      className='text-gray-800 dark:text-white p-2 text-sm border-none bg-gray-200 dark:bg-gray-600 rounded-md h-8 focus:outline-none w-48'
                    />
                    <button
                      className='btn btn-neutral text-sm px-2 py-1'
                      onClick={() => {
                        handleImageUrlChange();
                        setAttachDropDown(false);
                      }}
                      aria-label={t('add_image_url') as string}
                    >
                      {t('add_image_url')}
                    </button>
                  </div>
                </div>
              </div>
            )}
            <CommandPrompt _setContent={_setContent} />
          </div>

          <div className='flex-1' />

          <div className='flex items-center gap-1 whitespace-nowrap'>
            {sticky && (
              <button
                className={`btn btn-small btn-primary ${
                  isCurrentChatGenerating || noModel || !canSubmitDraft
                    ? 'cursor-not-allowed opacity-40'
                    : ''
                }`}
                onClick={handleGenerate}
                disabled={isCurrentChatGenerating || noModel || !canSubmitDraft}
                aria-label={t('generate') as string}
              >
                {t('generate')}
              </button>
            )}

            {!sticky && isUser && (
              isNotLast ? (
                <div className='relative flex items-stretch' ref={generateMenuRef}>
                  <button
                    className={`btn btn-small btn-primary rounded-r-none border-r-0 ${
                      isCurrentChatGenerating || noModel ? 'cursor-not-allowed opacity-40' : ''
                    }`}
                    onClick={() => {
                      !isCurrentChatGenerating && !noModel && handleGenerateNextOnly();
                    }}
                    disabled={isCurrentChatGenerating || noModel}
                    title={t('regenerateNextTooltip') as string}
                  >
                    {t('generate')}
                  </button>
                  <button
                    className={`btn btn-small btn-primary rounded-l-none border-l border-white/20 !w-8 justify-center px-0 ${
                      isCurrentChatGenerating || noModel ? 'cursor-not-allowed opacity-40' : ''
                    }`}
                    onClick={() => {
                      if (isCurrentChatGenerating || noModel) return;
                      setGenerateMenuOpen(!generateMenuOpen);
                    }}
                    disabled={isCurrentChatGenerating || noModel}
                    aria-label={t('regenerateBelow') as string}
                    title={t('regenerateBelowTooltip') as string}
                  >
                    <DownChevronArrow />
                  </button>
                  <div
                    className={`${
                      generateMenuOpen ? '' : 'hidden'
                    } absolute right-0 bottom-full mb-1 z-10 w-max overflow-hidden rounded-lg border border-black/10 bg-white/95 p-1 shadow-lg backdrop-blur dark:border-white/10 dark:bg-gray-800/95`}
                  >
                    <button
                      className='block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700'
                      onClick={() => {
                        setGenerateMenuOpen(false);
                        !isCurrentChatGenerating && !noModel && setIsModalOpen(true);
                      }}
                    >
                      {t('regenerateBelow')}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className={`btn btn-small btn-primary ${
                    isCurrentChatGenerating || noModel ? 'cursor-not-allowed opacity-40' : ''
                  }`}
                  onClick={() => {
                    !isCurrentChatGenerating && !noModel && handleGenerate();
                  }}
                  disabled={isCurrentChatGenerating || noModel}
                  title={t('generateTooltip') as string}
                >
                  {t('generate')}
                </button>
              )
            )}

            <button
              className={`btn btn-small ${
                sticky
                  ? `btn-neutral ${
                      isCurrentChatGenerating ? 'cursor-not-allowed opacity-40' : ''
                    }`
                  : 'btn-neutral'
              }`}
              onClick={handleSave}
              aria-label={t('save') as string}
            >
              {t('save')}
            </button>

            {sticky || (
              <button
                className='btn btn-small btn-neutral'
                onClick={handleCancel}
                aria-label={t('cancel') as string}
              >
                {t('cancel')}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }
);

export default EditViewButtons;
