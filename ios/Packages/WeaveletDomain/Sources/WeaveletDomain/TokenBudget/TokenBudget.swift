import Foundation

/// Token budget calculation utilities.
/// Determines how many tokens can be used for prompts vs. completions
/// within a given model's context window.
public enum TokenBudget {

    public static let unknownModelContextLength = 8192
    public static let unknownModelUIContextLength = 128_000

    private static let minPromptRatio = 0.1
    private static let defaultReservedCompletionRatio = 0.2
    private static let minReservedCompletionTokens = 1024

    // MARK: - Core Calculations

    private static func normalizeContextLength(_ contextLength: Int) -> Int {
        max(1, contextLength)
    }

    /// Minimum tokens that must be reserved for the prompt.
    public static func getMinPromptTokens(contextLength: Int) -> Int {
        let normalized = normalizeContextLength(contextLength)
        return max(1, Int(Double(normalized) * minPromptRatio))
    }

    /// Maximum tokens that can be used for completion output.
    public static func getMaxCompletionTokens(contextLength: Int) -> Int {
        let normalized = normalizeContextLength(contextLength)
        return max(0, normalized - getMinPromptTokens(contextLength: normalized))
    }

    /// Clamp requested completion tokens to valid range.
    public static func clampCompletionTokens(_ requested: Int, contextLength: Int) -> Int {
        min(max(0, requested), getMaxCompletionTokens(contextLength: contextLength))
    }

    /// Tokens reserved for completion (user-specified or default).
    public static func getReservedCompletionTokens(
        contextLength: Int,
        requestedCompletionTokens: Int
    ) -> Int {
        if requestedCompletionTokens > 0 {
            return clampCompletionTokens(requestedCompletionTokens, contextLength: contextLength)
        }

        let normalized = normalizeContextLength(contextLength)
        let defaultReserved = max(
            minReservedCompletionTokens,
            Int(Double(normalized) * defaultReservedCompletionRatio)
        )
        return clampCompletionTokens(defaultReserved, contextLength: normalized)
    }

    /// Maximum tokens available for the prompt.
    public static func getPromptBudget(
        contextLength: Int,
        requestedCompletionTokens: Int
    ) -> Int {
        let normalized = normalizeContextLength(contextLength)
        let reserved = getReservedCompletionTokens(
            contextLength: normalized,
            requestedCompletionTokens: requestedCompletionTokens
        )
        return max(
            getMinPromptTokens(contextLength: normalized),
            normalized - reserved
        )
    }

    /// Whether the given prompt fits within the context window.
    public static func fitsContextWindow(
        promptTokens: Int,
        contextLength: Int,
        requestedCompletionTokens: Int
    ) -> Bool {
        let normalized = normalizeContextLength(contextLength)
        let prompt = max(0, promptTokens)
        let reserved = getReservedCompletionTokens(
            contextLength: normalized,
            requestedCompletionTokens: requestedCompletionTokens
        )
        return prompt + reserved <= normalized
    }
}
