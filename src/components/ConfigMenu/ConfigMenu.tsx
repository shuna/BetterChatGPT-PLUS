import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import PopupModal from '@components/PopupModal';
import { ConfigInterface, ImageDetail } from '@type/chat';
import { getModelMaxToken } from '@utils/modelLookup';
import { ModelOptions } from '@type/chat';
import { isModelStreamSupported, normalizeConfigStream } from '@utils/streamSupport';
import useStore from '@store/store';
import { ProviderId } from '@type/provider';
import {
  DarkSelectField,
  FieldDescription,
  FieldLabel,
  RangeField,
} from './fields';

const ConfigMenu = ({
  setIsModalOpen,
  config,
  setConfig,
  imageDetail,
  setImageDetail,
}: {
  setIsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  config: ConfigInterface;
  setConfig: (config: ConfigInterface) => void;
  imageDetail: ImageDetail;
  setImageDetail: (imageDetail: ImageDetail) => void;
}) => {
  const [_maxToken, _setMaxToken] = useState<number>(config.max_tokens);
  const [_model, _setModel] = useState<ModelOptions>(config.model);
  const [_providerId, _setProviderId] = useState<ProviderId | undefined>(config.providerId);
  const [_temperature, _setTemperature] = useState<number>(config.temperature);
  const [_presencePenalty, _setPresencePenalty] = useState<number>(
    config.presence_penalty
  );
  const [_topP, _setTopP] = useState<number>(config.top_p);
  const [_frequencyPenalty, _setFrequencyPenalty] = useState<number>(
    config.frequency_penalty
  );
  const [_imageDetail, _setImageDetail] = useState<ImageDetail>(imageDetail);
  const [_stream, _setStream] = useState<boolean>(config.stream !== false);
  const { t } = useTranslation('model');
  const isStreamSupported = isModelStreamSupported(_model, _providerId);

  useEffect(() => {
    if (!isStreamSupported && _stream) {
      _setStream(false);
    }
  }, [isStreamSupported, _stream]);

  const handleConfirm = () => {
    setConfig(normalizeConfigStream({
      max_tokens: _maxToken,
      model: _model,
      temperature: _temperature,
      presence_penalty: _presencePenalty,
      top_p: _topP,
      frequency_penalty: _frequencyPenalty,
      stream: _stream,
      providerId: _providerId,
    }));
    setImageDetail(_imageDetail);
    setIsModalOpen(false);
  };

  return (
    <PopupModal
      title={t('configuration') as string}
      setIsModalOpen={setIsModalOpen}
      handleConfirm={handleConfirm}
      handleClickBackdrop={handleConfirm}
    >
      <div className='p-6 border-b border-gray-200 dark:border-gray-600'>
        <ModelSelector
          _model={_model}
          _setModel={_setModel}
          _providerId={_providerId}
          _onModelChange={(modelId, providerId) => {
            _setModel(modelId);
            _setProviderId(providerId);
          }}
          _label={t('Model')}
        />
        <StreamToggle
          _stream={_stream}
          _setStream={_setStream}
          disabled={!isStreamSupported}
        />
        <MaxTokenSlider
          _maxToken={_maxToken}
          _setMaxToken={_setMaxToken}
          _model={_model}
          _providerId={_providerId}
        />
        <TemperatureSlider
          _temperature={_temperature}
          _setTemperature={_setTemperature}
        />
        <TopPSlider _topP={_topP} _setTopP={_setTopP} />
        <PresencePenaltySlider
          _presencePenalty={_presencePenalty}
          _setPresencePenalty={_setPresencePenalty}
        />
        <FrequencyPenaltySlider
          _frequencyPenalty={_frequencyPenalty}
          _setFrequencyPenalty={_setFrequencyPenalty}
        />
        <ImageDetailSelector
          _imageDetail={_imageDetail}
          _setImageDetail={_setImageDetail}
        />
      </div>
    </PopupModal>
  );
};

export const ModelSelector = ({
  _model,
  _setModel,
  _providerId,
  _onModelChange,
  _label,
}: {
  _model: ModelOptions;
  _setModel: React.Dispatch<React.SetStateAction<ModelOptions>>;
  _providerId?: ProviderId;
  _onModelChange?: (modelId: ModelOptions, providerId: ProviderId | undefined) => void;
  _label: string;
}) => {
  const { t } = useTranslation(['main', 'model']);
  const favoriteModels = useStore((state) => state.favoriteModels) || [];
  const providers = useStore((state) => state.providers) || {};

  // Use composite key "modelId:::providerId" to disambiguate same modelId across providers
  const modelOptionsFormatted = favoriteModels.map((fav) => ({
    value: `${fav.modelId}:::${fav.providerId}`,
    label: `${fav.modelId} (${providers[fav.providerId]?.name || fav.providerId})`,
  }));

  // Find the current composite value using providerId for exact match
  const currentFav = _providerId
    ? favoriteModels.find((f) => f.modelId === _model && f.providerId === _providerId)
    : favoriteModels.find((f) => f.modelId === _model);
  const currentComposite = currentFav
    ? `${currentFav.modelId}:::${currentFav.providerId}`
    : _model;

  return (
    <DarkSelectField
      label={_label}
      value={currentComposite}
      options={modelOptionsFormatted}
      onChange={(value) => {
        if (!value) return;
        const [modelId, providerId] = (value as string).split(':::');
        if (_onModelChange) {
          _onModelChange(modelId as ModelOptions, providerId as ProviderId);
        } else {
          _setModel(modelId as ModelOptions);
        }
      }}
      placeholder={t('model:provider.noModelSelected', 'No model selected') as string}
      isClearable
      className='mb-4'
    />
  );
};

export const MaxTokenSlider = ({
  _maxToken,
  _setMaxToken,
  _model,
  _providerId,
}: {
  _maxToken: number;
  _setMaxToken: React.Dispatch<React.SetStateAction<number>>;
  _model: ModelOptions;
  _providerId?: ProviderId;
}) => {
  const { t } = useTranslation('model');
  const favoriteModels = useStore((state) => state.favoriteModels) || [];

  const getMaxForModel = (): number => {
    const lookupMax = getModelMaxToken(_model, _providerId);
    if (lookupMax > 0) return lookupMax;
    const fav = _providerId
      ? favoriteModels.find((f) => f.modelId === _model && f.providerId === _providerId)
      : favoriteModels.find((f) => f.modelId === _model);
    if (fav?.contextLength) return fav.contextLength;
    return 128000; // sensible default
  };

  const maxForModel = getMaxForModel();

  useEffect(() => {
    if (_maxToken > maxForModel) {
      _setMaxToken(maxForModel);
    }
  }, [_maxToken, _setMaxToken, maxForModel]);

  return (
    <RangeField
      label={t('token.label') as string}
      value={_maxToken}
      onChange={_setMaxToken}
      min={0}
      max={Math.floor(maxForModel * 0.9)}
      step={1}
      description={t('token.description')}
    />
  );
};

export const TemperatureSlider = ({
  _temperature,
  _setTemperature,
}: {
  _temperature: number;
  _setTemperature: React.Dispatch<React.SetStateAction<number>>;
}) => {
  const { t } = useTranslation('model');

  return (
    <RangeField
      label={t('temperature.label') as string}
      value={_temperature}
      onChange={_setTemperature}
      min={0}
      max={2}
      step={0.1}
      description={t('temperature.description')}
    />
  );
};

export const TopPSlider = ({
  _topP,
  _setTopP,
}: {
  _topP: number;
  _setTopP: React.Dispatch<React.SetStateAction<number>>;
}) => {
  const { t } = useTranslation('model');

  return (
    <RangeField
      label={t('topP.label') as string}
      value={_topP}
      onChange={_setTopP}
      min={0}
      max={1}
      step={0.05}
      description={t('topP.description')}
    />
  );
};

export const PresencePenaltySlider = ({
  _presencePenalty,
  _setPresencePenalty,
}: {
  _presencePenalty: number;
  _setPresencePenalty: React.Dispatch<React.SetStateAction<number>>;
}) => {
  const { t } = useTranslation('model');

  return (
    <RangeField
      label={t('presencePenalty.label') as string}
      value={_presencePenalty}
      onChange={_setPresencePenalty}
      min={-2}
      max={2}
      step={0.1}
      description={t('presencePenalty.description')}
    />
  );
};

export const FrequencyPenaltySlider = ({
  _frequencyPenalty,
  _setFrequencyPenalty,
}: {
  _frequencyPenalty: number;
  _setFrequencyPenalty: React.Dispatch<React.SetStateAction<number>>;
}) => {
  const { t } = useTranslation('model');

  return (
    <RangeField
      label={t('frequencyPenalty.label') as string}
      value={_frequencyPenalty}
      onChange={_setFrequencyPenalty}
      min={-2}
      max={2}
      step={0.1}
      description={t('frequencyPenalty.description')}
    />
  );
};

export const StreamToggle = ({
  _stream,
  _setStream,
  disabled = false,
}: {
  _stream: boolean;
  _setStream: React.Dispatch<React.SetStateAction<boolean>>;
  disabled?: boolean;
}) => {
  const { t } = useTranslation('model');

  return (
    <div className='mt-4 flex items-center justify-between'>
      <div>
        <FieldLabel>
          <span
          className={`block text-sm font-medium ${
            disabled
              ? 'text-gray-400 dark:text-gray-500'
              : 'text-gray-900 dark:text-white'
          }`}
        >
          {t('stream.label')}
          </span>
        </FieldLabel>
        <FieldDescription>
          <span
          className={`text-sm ${
            disabled
              ? 'text-gray-400 dark:text-gray-500'
              : 'text-gray-500 dark:text-gray-300'
          }`}
        >
          {disabled
            ? t(
                'stream.unsupportedDescription',
                'This model does not support streaming.'
              )
            : t('stream.description')}
          </span>
        </FieldDescription>
      </div>
      <button
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          disabled
            ? 'cursor-not-allowed bg-gray-300 dark:bg-gray-700 opacity-60'
            : _stream
              ? 'bg-blue-600'
              : 'bg-gray-400 dark:bg-gray-600'
        }`}
        onClick={() => {
          if (!disabled) {
            _setStream(!_stream);
          }
        }}
        type='button'
        role='switch'
        aria-checked={!disabled && _stream}
        aria-disabled={disabled}
        disabled={disabled}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            !disabled && _stream ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
};

export const ImageDetailSelector = ({
  _imageDetail,
  _setImageDetail,
}: {
  _imageDetail: ImageDetail;
  _setImageDetail: React.Dispatch<React.SetStateAction<ImageDetail>>;
}) => {
  const { t } = useTranslation('model');

  const imageDetailOptions: { value: ImageDetail; label: string }[] = [
    { value: 'low', label: t('imageDetail.low') },
    { value: 'high', label: t('imageDetail.high') },
    { value: 'auto', label: t('imageDetail.auto') },
  ];

  return (
    <DarkSelectField
      label={t('imageDetail.label') as string}
      value={_imageDetail}
      options={imageDetailOptions}
      onChange={(value) => _setImageDetail((value ?? _imageDetail) as ImageDetail)}
    />
  );
};

export default ConfigMenu;
