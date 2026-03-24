import Foundation
import WeaveletDomain

/// Default provider configurations matching src/store/provider-config.ts.
public enum DefaultProviders {
    public static let configs: [ProviderId: ProviderConfig] = [
        .openrouter: ProviderConfig(
            id: .openrouter, name: "OpenRouter",
            endpoint: "https://openrouter.ai/api/v1/chat/completions",
            modelsEndpoint: "https://openrouter.ai/api/v1/models",
            modelsRequireAuth: false
        ),
        .openai: ProviderConfig(
            id: .openai, name: "OpenAI",
            endpoint: "https://api.openai.com/v1/chat/completions",
            modelsEndpoint: "https://api.openai.com/v1/models",
            modelsRequireAuth: true
        ),
        .mistral: ProviderConfig(
            id: .mistral, name: "Mistral",
            endpoint: "https://api.mistral.ai/v1/chat/completions",
            modelsEndpoint: "https://api.mistral.ai/v1/models",
            modelsRequireAuth: true
        ),
        .groq: ProviderConfig(
            id: .groq, name: "Groq",
            endpoint: "https://api.groq.com/openai/v1/chat/completions",
            modelsEndpoint: "https://api.groq.com/openai/v1/models",
            modelsRequireAuth: true
        ),
        .together: ProviderConfig(
            id: .together, name: "Together AI",
            endpoint: "https://api.together.xyz/v1/chat/completions",
            modelsEndpoint: "https://api.together.xyz/v1/models",
            modelsRequireAuth: true
        ),
        .cohere: ProviderConfig(
            id: .cohere, name: "Cohere",
            endpoint: "https://api.cohere.ai/v2/chat",
            modelsEndpoint: "https://api.cohere.ai/v2/models",
            modelsRequireAuth: true
        ),
        .perplexity: ProviderConfig(
            id: .perplexity, name: "Perplexity",
            endpoint: "https://api.perplexity.ai/chat/completions",
            modelsEndpoint: nil,
            modelsRequireAuth: false
        ),
        .deepseek: ProviderConfig(
            id: .deepseek, name: "DeepSeek",
            endpoint: "https://api.deepseek.com/chat/completions",
            modelsEndpoint: "https://api.deepseek.com/models",
            modelsRequireAuth: true
        ),
        .xai: ProviderConfig(
            id: .xai, name: "xAI",
            endpoint: "https://api.x.ai/v1/chat/completions",
            modelsEndpoint: "https://api.x.ai/v1/models",
            modelsRequireAuth: true
        ),
        .fireworks: ProviderConfig(
            id: .fireworks, name: "Fireworks",
            endpoint: "https://api.fireworks.ai/inference/v1/chat/completions",
            modelsEndpoint: "https://api.fireworks.ai/inference/v1/models",
            modelsRequireAuth: true
        ),
    ]

    /// Provider display order matching web app.
    public static let order: [ProviderId] = [
        .openrouter, .openai, .deepseek, .mistral,
        .groq, .together, .perplexity, .xai, .cohere, .fireworks
    ]
}
