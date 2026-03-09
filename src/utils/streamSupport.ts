import { isModelStreamSupported as lookupStreamSupport } from '@utils/modelLookup';
import { ConfigInterface } from '@type/chat';
import type { ProviderId } from '@type/provider';

export const isModelStreamSupported = (model: string, providerId?: ProviderId): boolean =>
  lookupStreamSupport(model, providerId);

export const getEffectiveStreamEnabled = (config: ConfigInterface): boolean =>
  isModelStreamSupported(config.model, config.providerId) && config.stream !== false;

export const normalizeConfigStream = (
  config: ConfigInterface
): ConfigInterface => ({
  ...config,
  stream: isModelStreamSupported(config.model, config.providerId) ? config.stream !== false : false,
});
