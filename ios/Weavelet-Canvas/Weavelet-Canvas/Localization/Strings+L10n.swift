import Foundation

/// Centralized localization keys.
/// When String Catalog (Localizable.xcstrings) is added, these resolve automatically
/// via String(localized:). For now, they serve as documentation of all user-facing strings.
enum L10n {
    // MARK: - Common
    static let done = String(localized: "Done")
    static let cancel = String(localized: "Cancel")
    static let delete = String(localized: "Delete")
    static let save = String(localized: "Save")
    static let edit = String(localized: "Edit")
    static let search = String(localized: "Search")
    static let copy = String(localized: "Copy")
    static let rename = String(localized: "Rename")

    // MARK: - Chat
    static let newChat = String(localized: "New Chat")
    static let message = String(localized: "Message")
    static let generating = String(localized: "Generating...")
    static let stop = String(localized: "Stop")
    static let regenerate = String(localized: "Regenerate")
    static let findInChat = String(localized: "Find in chat...")

    // MARK: - Sidebar
    static let chats = String(localized: "Chats")
    static let folders = String(localized: "Folders")
    static let newFolder = String(localized: "New Folder")
    static let searchChats = String(localized: "Search chats")

    // MARK: - Settings
    static let settings = String(localized: "Settings")
    static let providers = String(localized: "Providers")
    static let appearance = String(localized: "Appearance")
    static let behavior = String(localized: "Behavior")
    static let importExport = String(localized: "Import / Export")
    static let promptLibrary = String(localized: "Prompt Library")

    // MARK: - Branch Editor
    static let branchEditor = String(localized: "Branch Editor")
    static let switchPath = String(localized: "Switch to This Path")
    static let viewDetail = String(localized: "View Detail")
    static let compare = String(localized: "Compare")

    // MARK: - Onboarding
    static let welcome = String(localized: "Welcome to Weavelet Canvas")
    static let getStarted = String(localized: "Get Started")
}
