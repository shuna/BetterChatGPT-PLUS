import Foundation

/// A saved prompt template in the prompt library.
struct Prompt: Codable, Identifiable, Hashable {
    var id: String
    var name: String
    var prompt: String

    init(id: String = UUID().uuidString, name: String, prompt: String) {
        self.id = id
        self.name = name
        self.prompt = prompt
    }
}

/// Built-in default prompts shipped with the app.
enum DefaultPrompts {
    static let all: [Prompt] = [
        Prompt(name: "Explain", prompt: "Explain the following in simple terms:\n\n"),
        Prompt(name: "Summarize", prompt: "Summarize the following:\n\n"),
        Prompt(name: "Translate to English", prompt: "Translate the following to English:\n\n"),
        Prompt(name: "Translate to Japanese", prompt: "次の文章を日本語に翻訳してください:\n\n"),
        Prompt(name: "Fix grammar", prompt: "Fix the grammar and spelling in the following text:\n\n"),
        Prompt(name: "Write code", prompt: "Write code to accomplish the following:\n\n"),
        Prompt(name: "Pros and cons", prompt: "List the pros and cons of the following:\n\n"),
    ]
}
