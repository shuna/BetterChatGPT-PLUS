import SwiftUI
import WeaveletDomain
import WeaveletInfra

/// Displays token count and estimated cost for the current conversation.
/// Shown as a compact bar below the toolbar.
struct TokenCostBar: View {
    let messages: [Message]
    let config: ChatConfig
    let settings: SettingsViewModel

    var body: some View {
        let estimate = estimateTokens()

        HStack(spacing: 12) {
            // Token count
            HStack(spacing: 4) {
                Image(systemName: "number")
                    .font(.system(size: 9))
                Text("\(estimate.totalTokens) tokens")
                    .font(.caption2)
            }
            .foregroundStyle(.secondary)

            // Context usage bar
            if let maxCtx = contextLength {
                HStack(spacing: 4) {
                    let ratio = min(Double(estimate.totalTokens) / Double(maxCtx), 1.0)
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            Capsule()
                                .fill(Color(.systemGray5))
                            Capsule()
                                .fill(ratio > 0.9 ? .red : ratio > 0.7 ? .orange : .green)
                                .frame(width: geo.size.width * ratio)
                        }
                    }
                    .frame(width: 40, height: 4)
                    Text("\(Int(min(Double(estimate.totalTokens) / Double(maxCtx) * 100, 100)))%")
                        .font(.system(size: 9))
                        .monospacedDigit()
                }
                .foregroundStyle(.secondary)
            }

            // Cost estimate
            if estimate.estimatedCost > 0 {
                HStack(spacing: 4) {
                    Image(systemName: "dollarsign.circle")
                        .font(.system(size: 9))
                    Text(formatCost(estimate.estimatedCost))
                        .font(.caption2)
                        .monospacedDigit()
                }
                .foregroundStyle(.secondary)
            }

            Spacer()

            // Message count
            Text("\(messages.count) msgs")
                .font(.caption2)
                .foregroundStyle(.tertiary)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 3)
        .background(.bar)
    }

    // MARK: - Estimation

    struct TokenEstimate {
        var totalTokens: Int
        var estimatedCost: Double
    }

    private func estimateTokens() -> TokenEstimate {
        // Simple estimation: ~4 chars per token (rough heuristic)
        var totalChars = 0
        for msg in messages {
            for item in msg.content {
                if let text = item.textValue {
                    totalChars += text.count
                }
            }
        }
        let estimatedTokens = max(totalChars / 4, 1)

        // Cost: look up from favorites or model cache
        let model = config.model
        let providerId = config.providerId ?? .openrouter
        var promptPrice: Double = 0
        var completionPrice: Double = 0

        // Check favorites
        if let fav = settings.favoriteModels.first(where: { $0.modelId == model && $0.providerId == providerId }) {
            promptPrice = fav.promptPrice ?? 0
            completionPrice = fav.completionPrice ?? 0
        }
        // Check cache
        else if let cached = settings.providerModelCache[providerId]?.first(where: { $0.id == model }) {
            promptPrice = cached.promptPrice ?? 0
            completionPrice = cached.completionPrice ?? 0
        }

        // Cost in $/1M tokens
        let inputCost = Double(estimatedTokens) * promptPrice / 1_000_000
        let outputCost = Double(estimatedTokens / 2) * completionPrice / 1_000_000

        return TokenEstimate(
            totalTokens: estimatedTokens,
            estimatedCost: inputCost + outputCost
        )
    }

    private var contextLength: Int? {
        let model = config.model
        let providerId = config.providerId ?? .openrouter
        if let fav = settings.favoriteModels.first(where: { $0.modelId == model && $0.providerId == providerId }) {
            return fav.contextLength
        }
        if let cached = settings.providerModelCache[providerId]?.first(where: { $0.id == model }) {
            return cached.contextLength
        }
        return nil
    }

    private func formatCost(_ cost: Double) -> String {
        if cost < 0.001 { return "<$0.001" }
        if cost < 0.01 { return String(format: "$%.4f", cost) }
        return String(format: "$%.3f", cost)
    }
}
