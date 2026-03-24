import Foundation
import WeaveletDomain

/// Fetches and normalizes model lists from provider APIs.
/// Direct port of src/api/providerModels.ts.
public final class ModelFetchService: Sendable {

    public static let shared = ModelFetchService()

    private init() {}

    // MARK: - Public API

    /// Fetch models from a provider's models endpoint.
    /// Returns normalized, filtered models sorted by name.
    public func fetchModels(for config: ProviderConfig) async -> [ProviderModel] {
        guard let modelsEndpoint = config.modelsEndpoint,
              !modelsEndpoint.isEmpty else { return [] }

        if config.modelsRequireAuth && (config.apiKey == nil || config.apiKey?.isEmpty == true) {
            return []
        }

        guard let url = URL(string: modelsEndpoint) else { return [] }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.timeoutInterval = 15

        if config.modelsRequireAuth, let apiKey = config.apiKey {
            request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        }

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let httpResponse = response as? HTTPURLResponse,
                  httpResponse.statusCode == 200 else {
                return []
            }

            let json = try JSONSerialization.jsonObject(with: data)
            return normalizeModels(providerId: config.id, json: json)
        } catch {
            return []
        }
    }

    // MARK: - Normalization (port of providerModels.ts)

    private func normalizeModels(providerId: ProviderId, json: Any) -> [ProviderModel] {
        let entries = getModelEntries(from: json)
        return entries.compactMap { normalizeModelEntry(providerId: providerId, entry: $0) }
    }

    private func getModelEntries(from json: Any) -> [[String: Any]] {
        guard let dict = json as? [String: Any] else { return [] }
        if let data = dict["data"] as? [[String: Any]] { return data }
        if let models = dict["models"] as? [[String: Any]] { return models }
        return []
    }

    private func normalizeModelEntry(providerId: ProviderId, entry: [String: Any]) -> ProviderModel? {
        let id = (entry["id"] as? String) ?? (entry["name"] as? String)
        let name = (entry["name"] as? String) ?? (entry["id"] as? String)

        guard let id, let name, isSupportedModelId(id) else { return nil }

        // Parse pricing
        var promptPrice: Double?
        var completionPrice: Double?
        if let pricing = entry["pricing"] as? [String: Any] {
            promptPrice = toMillionTokenPrice(pricing["prompt"])
            completionPrice = toMillionTokenPrice(pricing["completion"])
        }

        // Parse context length
        let contextLength = toInt(entry["context_length"]) ?? toInt(entry["context_window"])

        // Parse created
        let created = toInt(entry["created"])

        // Parse architecture/modality
        var modelType: ModelType = .text
        if let arch = entry["architecture"] as? [String: Any],
           let modality = arch["modality"] as? String {
            let inputModality = modality.split(separator: "->").first.map(String.init) ?? ""
            if inputModality.contains("image") { modelType = .image }
        }

        return ProviderModel(
            id: id,
            name: name,
            providerId: providerId,
            contextLength: contextLength,
            promptPrice: promptPrice,
            completionPrice: completionPrice,
            created: created,
            modelType: modelType,
            streamSupport: true,
            supportsReasoning: Self.isReasoningModel(id),
            supportsVision: modelType == .image || Self.isVisionModel(id),
            supportsAudio: Self.isAudioModel(id)
        )
    }

    // MARK: - Filters (port of providerModels.ts)

    private func isSupportedModelId(_ modelId: String) -> Bool {
        let id = modelId.lowercased()
        return !(
            id.contains("embed") ||
            id.contains("tts") ||
            id.contains("whisper") ||
            id.contains("dall-e") ||
            id.contains("moderation")
        )
    }

    // MARK: - Capability Detection (port of providerModels.ts)

    private static let reasoningModelRE = try! NSRegularExpression(
        pattern: #"(?:^|[-/])o[134](?:$|[-/])"#
    )
    private static let reasoningModelNames = ["deepseek-r1", "deepseek-reasoner", "qwq"]

    static func isReasoningModel(_ modelId: String) -> Bool {
        let id = modelId.lowercased()
        let range = NSRange(id.startIndex..., in: id)
        if reasoningModelRE.firstMatch(in: id, range: range) != nil { return true }
        if reasoningModelNames.contains(where: { id.contains($0) }) { return true }
        // Claude reasoning
        if id.contains("claude") && id.contains("thinking") { return true }
        return false
    }

    static func isVisionModel(_ modelId: String) -> Bool {
        let id = modelId.lowercased()
        if id.range(of: #"gpt-4[o\-]"#, options: .regularExpression) != nil
            && !id.contains("audio-preview") { return true }
        if id.contains("claude-3") { return true }
        if id.contains("gemini") { return true }
        if id.contains("vision") { return true }
        return false
    }

    static func isAudioModel(_ modelId: String) -> Bool {
        let id = modelId.lowercased()
        return id.contains("audio") || id.contains("realtime")
    }

    // MARK: - Helpers

    private func toMillionTokenPrice(_ value: Any?) -> Double? {
        if let num = value as? Double, num.isFinite { return num * 1_000_000 }
        if let num = value as? Int { return Double(num) * 1_000_000 }
        if let str = value as? String, let num = Double(str), num.isFinite {
            return num * 1_000_000
        }
        return nil
    }

    private func toInt(_ value: Any?) -> Int? {
        if let num = value as? Int { return num }
        if let num = value as? Double, num.isFinite { return Int(num) }
        return nil
    }
}
