import Foundation

// MARK: - ProviderId

enum ProviderId: String, Codable, Hashable, CaseIterable {
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

// MARK: - ProviderConfig

struct ProviderConfig: Codable, Hashable, Identifiable {
    let id: ProviderId
    var name: String
    var apiKey: String?
    var endpoint: String
    var modelsEndpoint: String?
    var modelsRequireAuth: Bool
}

// MARK: - ProviderModel

struct ProviderModel: Codable, Hashable, Identifiable {
    let id: String
    var name: String
    var providerId: ProviderId
    var contextLength: Int?
    var promptPrice: Double?
    var completionPrice: Double?
    var created: Int?
    var modelType: String?        // "text" | "image"
    var streamSupport: Bool?
    var supportsReasoning: Bool?
    var supportsVision: Bool?
    var supportsAudio: Bool?
}

// MARK: - FavoriteModel

struct FavoriteModel: Codable, Hashable {
    let modelId: String
    let providerId: ProviderId
    var promptPrice: Double?
    var completionPrice: Double?
    var imagePrice: Double?
    var contextLength: Int?
    var modelType: String?
    var streamSupport: Bool?
    var supportsReasoning: Bool?
    var supportsVision: Bool?
    var supportsAudio: Bool?
}
