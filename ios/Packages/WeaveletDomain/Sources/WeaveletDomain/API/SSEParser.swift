import Foundation

/// Parsed SSE event with raw JSON data.
public struct SSEEvent: Sendable {
    public var data: Data
    public var done: Bool

    public init(data: Data = Data(), done: Bool = false) {
        self.data = data
        self.done = done
    }
}

/// Parses Server-Sent Events (SSE) format data.
///
/// SSE format:
/// - Events are separated by double newlines (`\n\n`)
/// - Data lines start with `data: `
/// - Stream ends with `data: [DONE]`
public enum SSEParser {

    /// Parse raw SSE text into events.
    ///
    /// - Parameters:
    ///   - data: Raw SSE text (may contain multiple events).
    ///   - flush: If true, treat any trailing data as a complete event.
    /// - Returns: Parsed events, leftover partial data, and done flag.
    public static func parse(_ data: String, flush: Bool = false) -> (events: [Data], partial: String, done: Bool) {
        // Normalize line endings
        let normalized = data
            .replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\r", with: "\n")

        // Split on double newline (event boundary)
        var rawEvents = normalized.components(separatedBy: "\n\n")

        // Last segment may be incomplete unless flushing
        let partial: String
        if flush {
            partial = ""
        } else {
            partial = rawEvents.popLast() ?? ""
        }

        var events: [Data] = []
        var done = false

        for rawEvent in rawEvents {
            let trimmed = rawEvent.trimmingCharacters(in: .whitespacesAndNewlines)
            if trimmed.isEmpty { continue }

            // Collect data: lines
            var dataLines: [String] = []
            for line in rawEvent.components(separatedBy: "\n") {
                if line.hasPrefix("data: ") {
                    dataLines.append(String(line.dropFirst(6)))
                } else if line == "data" {
                    dataLines.append("")
                }
                // Skip event:, id:, retry:, and comment lines
            }

            if dataLines.isEmpty { continue }

            let payload = dataLines.joined(separator: "\n")

            if payload.trimmingCharacters(in: .whitespaces) == "[DONE]" {
                done = true
                continue
            }

            // Try to produce valid JSON data
            if let jsonData = payload.data(using: .utf8) {
                // Verify it's valid JSON
                if (try? JSONSerialization.jsonObject(with: jsonData)) != nil {
                    events.append(jsonData)
                }
                // Malformed JSON is silently skipped (matching web behavior)
            }
        }

        return (events, partial, done)
    }

    /// Parse a single SSE data line and extract the content delta text.
    /// Returns nil if no text delta was found.
    public static func extractDeltaText(from jsonData: Data) -> String? {
        guard let json = try? JSONSerialization.jsonObject(with: jsonData) as? [String: Any],
              let choices = json["choices"] as? [[String: Any]],
              let first = choices.first,
              let delta = first["delta"] as? [String: Any],
              let content = delta["content"] as? String
        else {
            return nil
        }
        return content
    }

    /// Extract reasoning content from a delta event.
    public static func extractReasoningText(from jsonData: Data) -> String? {
        guard let json = try? JSONSerialization.jsonObject(with: jsonData) as? [String: Any],
              let choices = json["choices"] as? [[String: Any]],
              let first = choices.first,
              let delta = first["delta"] as? [String: Any]
        else {
            return nil
        }

        // Different providers use different keys for reasoning
        if let reasoning = delta["reasoning"] as? String {
            return reasoning
        }
        if let reasoning = delta["reasoning_content"] as? String {
            return reasoning
        }
        return nil
    }
}
