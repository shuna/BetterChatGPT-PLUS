import { getModelCost, isKnownModel, type ModelCostEntry } from '@utils/modelLookup';
import type { MessageInterface, TotalTokenUsed } from '@type/chat';
import { isImageContent } from '@type/chat';
import type { ProviderId } from '@type/provider';

export type UsageCostResult =
  | { kind: 'known'; cost: number; isFree: boolean }
  | { kind: 'unknown'; reason: 'model-not-registered' | 'no-pricing-data' };

export const parseTokenKey = (
  key: string
): { modelId: string; providerId?: ProviderId } => {
  const sep = key.indexOf(':::');
  if (sep >= 0) {
    return {
      modelId: key.slice(0, sep),
      providerId: key.slice(sep + 3) as ProviderId,
    };
  }
  return { modelId: key };
};

export const countImageInputs = (messages: MessageInterface[]): number =>
  messages.reduce(
    (total, message) =>
      total +
      message.content.reduce(
        (count, content) => count + (isImageContent(content) ? 1 : 0),
        0
      ),
    0
  );

const resolveUnitCost = (
  priceEntry: ModelCostEntry['prompt'] | ModelCostEntry['image'] | undefined,
  usage: number
): number | null => {
  if (!priceEntry) return usage === 0 ? 0 : null;
  if (priceEntry.price == null) return usage === 0 ? 0 : null;
  return (priceEntry.price / priceEntry.unit) * usage;
};

export const calculateUsageCost = (
  usage: TotalTokenUsed[string] | undefined,
  modelId: string,
  providerId?: ProviderId
): UsageCostResult => {
  if (!usage) return { kind: 'known', cost: 0, isFree: true };

  const costEntry = getModelCost(modelId, providerId);
  if (!costEntry) {
    return isKnownModel(modelId)
      ? { kind: 'unknown', reason: 'no-pricing-data' }
      : { kind: 'unknown', reason: 'model-not-registered' };
  }

  const promptCost = resolveUnitCost(costEntry.prompt, usage.promptTokens);
  const completionCost = resolveUnitCost(
    costEntry.completion,
    usage.completionTokens
  );
  const imageCost = resolveUnitCost(costEntry.image, usage.imageTokens);

  if (promptCost == null || completionCost == null || imageCost == null) {
    return { kind: 'unknown', reason: 'no-pricing-data' };
  }

  const totalCost = promptCost + completionCost + imageCost;
  return {
    kind: 'known',
    cost: totalCost,
    isFree:
      (costEntry.prompt.price ?? 0) === 0 &&
      (costEntry.completion.price ?? 0) === 0 &&
      (costEntry.image?.price ?? 0) === 0,
  };
};
