import Foundation

public enum ProviderId: String, Codable, Sendable, CaseIterable {
    case openrouter
    case openai
    case mistral
    case groq
    case together
    case cohere
    case perplexity
    case deepseek
    case xai
    case fireworks
}

public struct ProviderConfig: Codable, Sendable, Equatable {
    public var id: ProviderId
    public var name: String
    public var apiKey: String?
    public var endpoint: String
    public var modelsEndpoint: String?
    public var modelsRequireAuth: Bool

    public init(
        id: ProviderId,
        name: String,
        apiKey: String? = nil,
        endpoint: String,
        modelsEndpoint: String? = nil,
        modelsRequireAuth: Bool = true
    ) {
        self.id = id
        self.name = name
        self.apiKey = apiKey
        self.endpoint = endpoint
        self.modelsEndpoint = modelsEndpoint
        self.modelsRequireAuth = modelsRequireAuth
    }
}

public enum ModelType: String, Codable, Sendable {
    case text
    case image
}

public struct ProviderModel: Codable, Sendable, Equatable, Identifiable {
    public var id: String
    public var name: String
    public var providerId: ProviderId
    public var contextLength: Int?
    public var promptPrice: Double?
    public var completionPrice: Double?
    public var created: Int?
    public var modelType: ModelType?
    public var streamSupport: Bool?
    public var supportsReasoning: Bool?
    public var supportsVision: Bool?
    public var supportsAudio: Bool?

    public init(
        id: String,
        name: String,
        providerId: ProviderId,
        contextLength: Int? = nil,
        promptPrice: Double? = nil,
        completionPrice: Double? = nil,
        created: Int? = nil,
        modelType: ModelType? = nil,
        streamSupport: Bool? = nil,
        supportsReasoning: Bool? = nil,
        supportsVision: Bool? = nil,
        supportsAudio: Bool? = nil
    ) {
        self.id = id
        self.name = name
        self.providerId = providerId
        self.contextLength = contextLength
        self.promptPrice = promptPrice
        self.completionPrice = completionPrice
        self.created = created
        self.modelType = modelType
        self.streamSupport = streamSupport
        self.supportsReasoning = supportsReasoning
        self.supportsVision = supportsVision
        self.supportsAudio = supportsAudio
    }
}

public struct CustomProviderModel: Codable, Sendable, Equatable {
    public var modelId: String
    public var providerId: ProviderId
    public var name: String?
    public var modelType: ModelType
    public var contextLength: Int?
    public var promptPrice: Double?
    public var completionPrice: Double?
    public var imagePrice: Double?
    public var streamSupport: Bool?
    public var supportsReasoning: Bool?
    public var supportsVision: Bool?
    public var supportsAudio: Bool?

    public init(
        modelId: String,
        providerId: ProviderId,
        name: String? = nil,
        modelType: ModelType = .text,
        contextLength: Int? = nil,
        promptPrice: Double? = nil,
        completionPrice: Double? = nil,
        imagePrice: Double? = nil,
        streamSupport: Bool? = nil,
        supportsReasoning: Bool? = nil,
        supportsVision: Bool? = nil,
        supportsAudio: Bool? = nil
    ) {
        self.modelId = modelId
        self.providerId = providerId
        self.name = name
        self.modelType = modelType
        self.contextLength = contextLength
        self.promptPrice = promptPrice
        self.completionPrice = completionPrice
        self.imagePrice = imagePrice
        self.streamSupport = streamSupport
        self.supportsReasoning = supportsReasoning
        self.supportsVision = supportsVision
        self.supportsAudio = supportsAudio
    }
}

public struct FavoriteModel: Codable, Sendable, Equatable {
    public var modelId: String
    public var providerId: ProviderId
    public var promptPrice: Double?
    public var completionPrice: Double?
    public var imagePrice: Double?
    public var contextLength: Int?
    public var modelType: ModelType?
    public var streamSupport: Bool?
    public var supportsReasoning: Bool?
    public var supportsVision: Bool?
    public var supportsAudio: Bool?

    public init(
        modelId: String,
        providerId: ProviderId,
        promptPrice: Double? = nil,
        completionPrice: Double? = nil,
        imagePrice: Double? = nil,
        contextLength: Int? = nil,
        modelType: ModelType? = nil,
        streamSupport: Bool? = nil,
        supportsReasoning: Bool? = nil,
        supportsVision: Bool? = nil,
        supportsAudio: Bool? = nil
    ) {
        self.modelId = modelId
        self.providerId = providerId
        self.promptPrice = promptPrice
        self.completionPrice = completionPrice
        self.imagePrice = imagePrice
        self.contextLength = contextLength
        self.modelType = modelType
        self.streamSupport = streamSupport
        self.supportsReasoning = supportsReasoning
        self.supportsVision = supportsVision
        self.supportsAudio = supportsAudio
    }
}
