import SwiftUI
import WeaveletDomain

/// Keyboard shortcuts for iPad external keyboard.
/// Matches Web version's shortcuts where applicable.
struct KeyboardShortcutModifier: ViewModifier {
    @Environment(AppState.self) private var appState

    func body(content: Content) -> some View {
        content
            // Cmd+N: New chat
            .keyboardShortcut("n", modifiers: .command)
            // Additional shortcuts applied via .commands {} on WindowGroup
    }
}

/// Command menu for keyboard shortcuts (iPad external keyboard).
struct AppCommands: Commands {
    let appState: AppState

    var body: some Commands {
        // File menu
        CommandGroup(replacing: .newItem) {
            Button("New Chat") {
                appState.chatList.createNewChat(contentStore: appState.conversation.contentStore)
                if let chat = appState.chatList.currentChat {
                    appState.conversation.setActiveChat(chat, contentStore: appState.conversation.contentStore)
                }
            }
            .keyboardShortcut("n", modifiers: .command)

            Button("Save") {
                appState.saveAll()
            }
            .keyboardShortcut("s", modifiers: .command)
        }

        // Edit menu
        CommandGroup(after: .undoRedo) {
            Button("Undo") {
                appState.conversation.undo()
                appState.conversation.syncToList(appState.chatList)
            }
            .keyboardShortcut("z", modifiers: .command)
            .disabled(!appState.conversation.canUndo)

            Button("Redo") {
                appState.conversation.redo()
                appState.conversation.syncToList(appState.chatList)
            }
            .keyboardShortcut("z", modifiers: [.command, .shift])
            .disabled(!appState.conversation.canRedo)
        }

        // View menu
        CommandMenu("View") {
            Button("Chat View") {
                appState.conversation.activeView = .chat
            }
            .keyboardShortcut("1", modifiers: .command)

            Button("Branch Editor") {
                appState.conversation.activeView = .branchEditor
            }
            .keyboardShortcut("2", modifiers: .command)

            Button("Split Horizontal") {
                appState.conversation.activeView = .splitHorizontal
            }
            .keyboardShortcut("3", modifiers: .command)

            Button("Split Vertical") {
                appState.conversation.activeView = .splitVertical
            }
            .keyboardShortcut("4", modifiers: .command)

            Divider()

            Button("Find in Chat") {
                // TODO: toggle find bar
            }
            .keyboardShortcut("f", modifiers: .command)
        }
    }
}
