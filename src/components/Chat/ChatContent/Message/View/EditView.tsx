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
  autoFocus = true,
}: {
  role?: string;
  content: ContentInterface[];
  setIsEdit: React.Dispatch<React.SetStateAction<boolean>>;
  messageIndex: number;
  nodeId?: string;
  sticky?: boolean;
  editSessionKey: string;
  autoFocus?: boolean;
}) => {
  const { t } = useTranslation();
  const stickySurfaceClass =
    'rounded-2xl bg-white/60 px-4 pt-2.5 pb-4 shadow-sm ring-1 ring-black/5 dark:bg-gray-900/20 dark:ring-white/10 md:px-5 md:pt-3 md:pb-5';
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
            ? stickySurfaceClass
            : ''
        }`}
      >
        <OverTypeEditor
          value={(logic._content[0] as TextContentInterface)?.text ?? ''}
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
          autoFocus={autoFocus}
          autoResize
          minHeight='5.25rem'
        />
        {sticky && (
          <EditViewButtons
            sticky={sticky}
            handleFileChange={logic.handleFileChange}
            handleImageDetailChange={logic.handleImageDetailChange}
            handleRemoveImage={logic.handleRemoveImage}
            handleGenerate={logic.handleGenerate}
            handleGenerateNextOnly={logic.handleGenerateNextOnly}
            handleBranchGenerate={logic.handleBranchGenerate}
            handleSave={logic.handleSave}
            handleBranchOnly={logic.handleBranchOnly}
            handleCancel={logic.handleCancel}
            contentChanged={logic.contentChanged}
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
          handleBranchGenerate={logic.handleBranchGenerate}
          handleSave={logic.handleSave}
          handleBranchOnly={logic.handleBranchOnly}
          handleCancel={logic.handleCancel}
          contentChanged={logic.contentChanged}
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
      {logic.isUnknownContextConfirmOpen && (
        <PopupModal
          setIsModalOpen={logic.setIsUnknownContextConfirmOpen}
          title={t('warning') as string}
          message={logic.unknownContextConfirmMessage}
          handleConfirm={logic.handleUnknownContextConfirm}
          handleClose={logic.handleUnknownContextCancel}
        />
      )}
    </div>
  );
};

export default EditView;
