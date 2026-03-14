import React from 'react';
import { useTranslation } from 'react-i18next';
import { ContentInterface, TextContentInterface } from '@type/chat';
import { useModelType } from '@utils/modelLookup';
import PopupModal from '@components/PopupModal';
import EditViewButtons from './EditViewButtons';
import { useEditViewLogic } from './useEditViewLogic';
import OverTypeEditor from './OverTypeEditor';

const EditView = ({
  role,
  content,
  setIsEdit,
  messageIndex,
  nodeId,
  sticky,
  editSessionKey,
}: {
  role?: string;
  content: ContentInterface[];
  setIsEdit: React.Dispatch<React.SetStateAction<boolean>>;
  messageIndex: number;
  nodeId?: string;
  sticky?: boolean;
  editSessionKey: string;
}) => {
  const { t } = useTranslation();
  const logic = useEditViewLogic({
    content,
    setIsEdit,
    messageIndex,
    nodeId,
    sticky,
    editSessionKey,
  });
  const isImageModel = useModelType(logic.model, logic.providerId) === 'image';

  return (
    <div className='relative'>
      <div
        className={`w-full ${
          sticky
            ? 'py-2 md:py-3 px-2 md:px-4 border border-black/10 bg-white dark:border-gray-900/50 dark:text-white dark:bg-gray-700 rounded-md shadow-[0_0_10px_rgba(0,0,0,0.10)] dark:shadow-[0_0_15px_rgba(0,0,0,0.10)]'
            : ''
        }`}
      >
        <OverTypeEditor
          value={(logic._content[0] as TextContentInterface).text}
          mode='edit'
          onChange={(val) => {
            logic._setContent((prev) => [
              { type: 'text', text: val },
              ...prev.slice(1),
            ]);
          }}
          onKeyDown={(e) => {
            logic.handleKeyDown(e as unknown as React.KeyboardEvent<HTMLTextAreaElement>);
          }}
          onPaste={(e) => {
            logic.handlePaste(e as unknown as React.ClipboardEvent<HTMLTextAreaElement>);
          }}
          placeholder={t('submitPlaceholder') as string}
          autoFocus
          autoResize
          minHeight='3.5rem'
        />
        {sticky && (
          <EditViewButtons
            sticky={sticky}
            handleFileChange={logic.handleFileChange}
            handleImageDetailChange={logic.handleImageDetailChange}
            handleRemoveImage={logic.handleRemoveImage}
            handleGenerate={logic.handleGenerate}
            handleGenerateNextOnly={logic.handleGenerateNextOnly}
            handleSave={logic.handleSave}
            handleCancel={logic.handleCancel}
            handleUploadButtonClick={logic.handleUploadButtonClick}
            setIsModalOpen={logic.setIsModalOpen}
            _setContent={logic._setContent}
            _content={logic._content}
            imageUrl={logic.imageUrl}
            setImageUrl={logic.setImageUrl}
            handleImageUrlChange={logic.handleImageUrlChange}
            fileInputRef={logic.fileInputRef}
            model={logic.model}
            providerId={logic.providerId}
            modelValid={logic.modelValid}
            messageIndex={messageIndex}
            role={role}
          />
        )}
      </div>
      {!sticky && (
        <EditViewButtons
          sticky={sticky}
          handleFileChange={logic.handleFileChange}
          handleImageDetailChange={logic.handleImageDetailChange}
          handleRemoveImage={logic.handleRemoveImage}
          handleGenerate={logic.handleGenerate}
          handleGenerateNextOnly={logic.handleGenerateNextOnly}
          handleSave={logic.handleSave}
          handleCancel={logic.handleCancel}
          handleUploadButtonClick={logic.handleUploadButtonClick}
          setIsModalOpen={logic.setIsModalOpen}
          _setContent={logic._setContent}
          _content={logic._content}
          imageUrl={logic.imageUrl}
          setImageUrl={logic.setImageUrl}
          handleImageUrlChange={logic.handleImageUrlChange}
          fileInputRef={logic.fileInputRef}
          model={logic.model}
          providerId={logic.providerId}
          modelValid={logic.modelValid}
          messageIndex={messageIndex}
          role={role}
        />
      )}
      {logic.isModalOpen && (
        <PopupModal
          setIsModalOpen={logic.setIsModalOpen}
          title={t('warning') as string}
          message={t('clearMessageWarning') as string}
          handleConfirm={logic.handleGenerate}
        />
      )}
    </div>
  );
};

export default EditView;
