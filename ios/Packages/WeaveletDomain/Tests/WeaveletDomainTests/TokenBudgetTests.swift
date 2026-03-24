import Testing
@testable import WeaveletDomain

// MARK: - Token Budget Tests

@Test func minPromptTokens() {
    #expect(TokenBudget.getMinPromptTokens(contextLength: 8192) == 819)
    #expect(TokenBudget.getMinPromptTokens(contextLength: 100) == 10)
    #expect(TokenBudget.getMinPromptTokens(contextLength: 1) >= 1)
}

@Test func maxCompletionTokens() {
    // 8192 - 819 (10%) = 7373
    #expect(TokenBudget.getMaxCompletionTokens(contextLength: 8192) == 7373)
}

@Test func clampCompletionTokens() {
    // Request within range
    #expect(TokenBudget.clampCompletionTokens(4096, contextLength: 8192) == 4096)
    // Request exceeds max
    #expect(TokenBudget.clampCompletionTokens(9999, contextLength: 8192) == 7373)
    // Negative request
    #expect(TokenBudget.clampCompletionTokens(-1, contextLength: 8192) == 0)
}

@Test func reservedCompletionTokensWithUserRequest() {
    let reserved = TokenBudget.getReservedCompletionTokens(
        contextLength: 8192,
        requestedCompletionTokens: 2048
    )
    #expect(reserved == 2048)
}

@Test func reservedCompletionTokensDefault() {
    let reserved = TokenBudget.getReservedCompletionTokens(
        contextLength: 8192,
        requestedCompletionTokens: 0
    )
    // 20% of 8192 = 1638
    #expect(reserved == 1638)
}

@Test func reservedCompletionTokensSmallContext() {
    let reserved = TokenBudget.getReservedCompletionTokens(
        contextLength: 2048,
        requestedCompletionTokens: 0
    )
    // max(1024, 20% of 2048=409) = 1024
    // clamped to max completion = 2048 - 204 = 1844
    #expect(reserved == 1024)
}

@Test func promptBudget() {
    let budget = TokenBudget.getPromptBudget(
        contextLength: 8192,
        requestedCompletionTokens: 0
    )
    // 8192 - 1638 = 6554
    #expect(budget == 6554)
}

@Test func promptBudgetWithUserRequest() {
    let budget = TokenBudget.getPromptBudget(
        contextLength: 8192,
        requestedCompletionTokens: 4096
    )
    // 8192 - 4096 = 4096
    #expect(budget == 4096)
}

@Test func fitsContextWindowTrue() {
    #expect(TokenBudget.fitsContextWindow(
        promptTokens: 4000,
        contextLength: 8192,
        requestedCompletionTokens: 4000
    ))
}

@Test func fitsContextWindowFalse() {
    #expect(!TokenBudget.fitsContextWindow(
        promptTokens: 7000,
        contextLength: 8192,
        requestedCompletionTokens: 2000
    ))
}

@Test func fitsContextWindowEdge() {
    // Exactly fits: 6554 prompt + 1638 reserved = 8192
    #expect(TokenBudget.fitsContextWindow(
        promptTokens: 6554,
        contextLength: 8192,
        requestedCompletionTokens: 0
    ))
}

// MARK: - Cost Calculation Tests

@Test func parseTokenKeySimple() {
    let (modelId, providerId) = CostCalculation.parseTokenKey("gpt-4o")
    #expect(modelId == "gpt-4o")
    #expect(providerId == nil)
}

@Test func parseTokenKeyWithProvider() {
    let (modelId, providerId) = CostCalculation.parseTokenKey("gpt-4o:::openai")
    #expect(modelId == "gpt-4o")
    #expect(providerId == .openai)
}

@Test func buildTokenUsageKey() {
    #expect(CostCalculation.buildTokenUsageKey(modelId: "gpt-4o") == "gpt-4o")
    #expect(CostCalculation.buildTokenUsageKey(modelId: "gpt-4o", providerId: .openai) == "gpt-4o:::openai")
}

@Test func countImageInputs() {
    let messages = [
        Message(role: .user, content: [
            .fromString("Look at this:"),
            .imageURL(ImageContent(url: "img1", detail: .auto)),
            .imageURL(ImageContent(url: "img2", detail: .high)),
        ]),
        Message(role: .assistant, text: "I see two images"),
    ]
    #expect(CostCalculation.countImageInputs(messages) == 2)
}

@Test func mergeTotalTokenUsed() {
    let base: TotalTokenUsed = [
        "gpt-4o": TokenUsage(promptTokens: 100, completionTokens: 50, imageTokens: 2),
    ]
    let increment: TotalTokenUsed = [
        "gpt-4o": TokenUsage(promptTokens: 200, completionTokens: 100, imageTokens: 1),
        "claude": TokenUsage(promptTokens: 50, completionTokens: 25, imageTokens: 0),
    ]

    let merged = CostCalculation.mergeTotalTokenUsed(base: base, increment: increment)
    #expect(merged["gpt-4o"]?.promptTokens == 300)
    #expect(merged["gpt-4o"]?.completionTokens == 150)
    #expect(merged["gpt-4o"]?.imageTokens == 3)
    #expect(merged["claude"]?.promptTokens == 50)
}

@Test func calculateUsageCostNilUsage() {
    let result = CostCalculation.calculateUsageCost(usage: nil, costEntry: nil)
    #expect(result == .known(cost: 0, isFree: true))
}

@Test func calculateUsageCostNoPricing() {
    let usage = TokenUsage(promptTokens: 100, completionTokens: 50)
    let result = CostCalculation.calculateUsageCost(usage: usage, costEntry: nil)
    #expect(result == .unknown(reason: .noPricingData))
}

@Test func calculateUsageCostKnown() {
    let usage = TokenUsage(promptTokens: 1_000_000, completionTokens: 500_000, imageTokens: 0)
    let costEntry = CostDetails(
        prompt: Pricing(price: 5.0, unit: 1_000_000),
        completion: Pricing(price: 15.0, unit: 1_000_000),
        image: Pricing(price: 0, unit: 1)
    )

    let result = CostCalculation.calculateUsageCost(usage: usage, costEntry: costEntry)
    if case .known(let cost, let isFree) = result {
        #expect(abs(cost - 12.5) < 0.001) // $5 prompt + $7.5 completion
        #expect(!isFree)
    } else {
        Issue.record("Expected known cost")
    }
}

@Test func calculateUsageCostFreeModel() {
    let usage = TokenUsage(promptTokens: 1000, completionTokens: 500)
    let costEntry = CostDetails(
        prompt: Pricing(price: 0, unit: 1_000_000),
        completion: Pricing(price: 0, unit: 1_000_000),
        image: Pricing(price: 0, unit: 1)
    )

    let result = CostCalculation.calculateUsageCost(usage: usage, costEntry: costEntry)
    if case .known(let cost, let isFree) = result {
        #expect(cost == 0)
        #expect(isFree)
    } else {
        Issue.record("Expected free model")
    }
}
