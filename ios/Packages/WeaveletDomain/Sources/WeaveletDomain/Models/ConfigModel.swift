import Foundation

public typealias ModelOptions = String

public enum ReasoningEffort: String, Codable, Sendable {
    case none
    case minimal
    case low
    case medium
    case high
    case xhigh
}

public enum Verbosity: String, Codable, Sendable {
    case low
    case medium
    case high
    case max
}

/// Configuration for a single chat session.
public struct ChatConfig: Codable, Sendable, Equatable {
    public var model: ModelOptions
    public var maxTokens: Int
    public var temperature: Double
    public var presencePenalty: Double
    public var topP: Double
    public var frequencyPenalty: Double
    public var stream: Bool?
    public var providerId: ProviderId?
    public var reasoningEffort: ReasoningEffort?
    public var reasoningBudgetTokens: Int?
    public var verbosity: Verbosity?
    public var includeDefaultSystemPrompt: Bool = true

    public init(
        model: ModelOptions = "",
        maxTokens: Int = 4096,
        temperature: Double = 1.0,
        presencePenalty: Double = 0.0,
        topP: Double = 1.0,
        frequencyPenalty: Double = 0.0,
        stream: Bool? = true,
        providerId: ProviderId? = nil,
        reasoningEffort: ReasoningEffort? = nil,
        reasoningBudgetTokens: Int? = nil,
        verbosity: Verbosity? = nil,
        includeDefaultSystemPrompt: Bool = true
    ) {
        self.model = model
        self.maxTokens = maxTokens
        self.temperature = temperature
        self.presencePenalty = presencePenalty
        self.topP = topP
        self.frequencyPenalty = frequencyPenalty
        self.stream = stream
        self.providerId = providerId
        self.reasoningEffort = reasoningEffort
        self.reasoningBudgetTokens = reasoningBudgetTokens
        self.verbosity = verbosity
        self.includeDefaultSystemPrompt = includeDefaultSystemPrompt
    }

    // Web-compatible JSON keys (snake_case)
    enum CodingKeys: String, CodingKey {
        case model
        case maxTokens = "max_tokens"
        case temperature
        case presencePenalty = "presence_penalty"
        case topP = "top_p"
        case frequencyPenalty = "frequency_penalty"
        case stream
        case providerId
        case reasoningEffort = "reasoning_effort"
        case reasoningBudgetTokens = "reasoning_budget_tokens"
        case verbosity
        case includeDefaultSystemPrompt = "includeDefaultSystemPrompt"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        model = try container.decode(ModelOptions.self, forKey: .model)
        maxTokens = try container.decode(Int.self, forKey: .maxTokens)
        temperature = try container.decode(Double.self, forKey: .temperature)
        presencePenalty = try container.decode(Double.self, forKey: .presencePenalty)
        topP = try container.decode(Double.self, forKey: .topP)
        frequencyPenalty = try container.decode(Double.self, forKey: .frequencyPenalty)
        stream = try container.decodeIfPresent(Bool.self, forKey: .stream)
        providerId = try container.decodeIfPresent(ProviderId.self, forKey: .providerId)
        reasoningEffort = try container.decodeIfPresent(ReasoningEffort.self, forKey: .reasoningEffort)
        reasoningBudgetTokens = try container.decodeIfPresent(Int.self, forKey: .reasoningBudgetTokens)
        verbosity = try container.decodeIfPresent(Verbosity.self, forKey: .verbosity)
        includeDefaultSystemPrompt = try container.decodeIfPresent(Bool.self, forKey: .includeDefaultSystemPrompt) ?? true
    }
}

// MARK: - Token Usage & Cost

public struct Pricing: Codable, Sendable, Equatable {
    public var price: Double
    public var unit: Int

    public init(price: Double, unit: Int) {
        self.price = price
        self.unit = unit
    }
}

public struct CostDetails: Codable, Sendable, Equatable {
    public var prompt: Pricing
    public var completion: Pricing
    public var image: Pricing

    public init(prompt: Pricing, completion: Pricing, image: Pricing) {
        self.prompt = prompt
        self.completion = completion
        self.image = image
    }
}

public struct TokenUsage: Codable, Sendable, Equatable {
    public var promptTokens: Int
    public var completionTokens: Int
    public var imageTokens: Int

    public init(promptTokens: Int = 0, completionTokens: Int = 0, imageTokens: Int = 0) {
        self.promptTokens = promptTokens
        self.completionTokens = completionTokens
        self.imageTokens = imageTokens
    }
}

/// Token usage keyed by model name.
public typealias TotalTokenUsed = [ModelOptions: TokenUsage]
