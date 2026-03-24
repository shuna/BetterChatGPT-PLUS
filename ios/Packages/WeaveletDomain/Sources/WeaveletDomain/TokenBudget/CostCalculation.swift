import Foundation

/// Result of a usage cost calculation.
public enum UsageCostResult: Sendable, Equatable {
    case known(cost: Double, isFree: Bool)
    case unknown(reason: UnknownReason)

    public enum UnknownReason: String, Sendable, Equatable {
        case modelNotRegistered = "model-not-registered"
        case noPricingData = "no-pricing-data"
    }
}

/// Cost calculation utilities for LLM API usage.
public enum CostCalculation {

    /// Parse a token usage key of format `{modelId}:::{providerId}`.
    public static func parseTokenKey(_ key: String) -> (modelId: String, providerId: ProviderId?) {
        if let sepRange = key.range(of: ":::") {
            let modelId = String(key[key.startIndex..<sepRange.lowerBound])
            let providerRaw = String(key[sepRange.upperBound...])
            return (modelId, ProviderId(rawValue: providerRaw))
        }
        return (key, nil)
    }

    /// Build a token usage key from model ID and optional provider ID.
    public static func buildTokenUsageKey(modelId: String, providerId: ProviderId? = nil) -> String {
        if let providerId {
            return "\(modelId):::\(providerId.rawValue)"
        }
        return modelId
    }

    /// Count the number of image content items across messages.
    public static func countImageInputs(_ messages: [Message]) -> Int {
        messages.reduce(0) { total, message in
            total + message.content.reduce(0) { count, item in
                count + (item.isImage ? 1 : 0)
            }
        }
    }

    /// Merge two token usage records.
    public static func mergeTotalTokenUsed(
        base: TotalTokenUsed,
        increment: TotalTokenUsed
    ) -> TotalTokenUsed {
        var merged = base
        for (key, usage) in increment {
            let existing = merged[key] ?? TokenUsage()
            merged[key] = TokenUsage(
                promptTokens: existing.promptTokens + usage.promptTokens,
                completionTokens: existing.completionTokens + usage.completionTokens,
                imageTokens: existing.imageTokens + usage.imageTokens
            )
        }
        return merged
    }

    /// Calculate usage cost for a given model and usage.
    ///
    /// - Parameters:
    ///   - usage: Token usage data (nil treated as zero cost).
    ///   - costEntry: Pricing data for the model.
    /// - Returns: Cost result (known or unknown).
    public static func calculateUsageCost(
        usage: TokenUsage?,
        costEntry: CostDetails?
    ) -> UsageCostResult {
        guard let usage else {
            return .known(cost: 0, isFree: true)
        }

        guard let costEntry else {
            return .unknown(reason: .noPricingData)
        }

        let promptCost = resolveUnitCost(costEntry.prompt, usage: usage.promptTokens)
        let completionCost = resolveUnitCost(costEntry.completion, usage: usage.completionTokens)
        let imageCost = resolveUnitCost(costEntry.image, usage: usage.imageTokens)

        let totalCost = promptCost + completionCost + imageCost
        let isFree = costEntry.prompt.price == 0
            && costEntry.completion.price == 0
            && costEntry.image.price == 0

        return .known(cost: totalCost, isFree: isFree)
    }

    private static func resolveUnitCost(_ pricing: Pricing, usage: Int) -> Double {
        guard pricing.unit > 0 else { return 0 }
        return (pricing.price / Double(pricing.unit)) * Double(usage)
    }
}
