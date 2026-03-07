import { modelStreamSupport } from '@constants/modelLoader';
import { ConfigInterface } from '@type/chat';
import { ModelOptions } from '@utils/modelReader';

export const isModelStreamSupported = (model: ModelOptions): boolean =>
  modelStreamSupport[model] ?? true;

export const getEffectiveStreamEnabled = (config: ConfigInterface): boolean =>
  isModelStreamSupported(config.model) && config.stream !== false;

export const normalizeConfigStream = (
  config: ConfigInterface
): ConfigInterface => ({
  ...config,
  stream: isModelStreamSupported(config.model) ? config.stream !== false : false,
});
