import SwiftUI

// MARK: - App Color Theme
// Matches the web version's softer color palette instead of iOS system defaults.

enum AppColors {
    // MARK: - Backgrounds

    /// Main background — web uses #f7f7f8 (light) / #343541 (dark)
    static let background = Color("AppBackground")

    /// Message background for user role — web uses white/60 (light) / gray-900/20 (dark)
    static let messageSurfaceUser = Color("MessageSurfaceUser")

    /// Message background for assistant role — web uses a slightly tinted surface
    static let messageSurfaceAssistant = Color("MessageSurfaceAssistant")

    /// Message background for system role
    static let messageSurfaceSystem = Color("MessageSurfaceSystem")

    /// Sidebar background — web uses #ececf1 (light) / #202123 (dark)
    static let sidebarBackground = Color("SidebarBackground")

    /// Input area background — web uses white (light) / #40414f (dark)
    static let inputBackground = Color("InputBackground")

    /// Branch editor canvas background
    static let canvasBackground = Color("CanvasBackground")

    // MARK: - Avatar Colors (matching web)

    /// User avatar — web: rgb(200, 70, 70) muted red
    static let avatarUser = Color(red: 200/255, green: 70/255, blue: 70/255)

    /// Assistant avatar — web: rgb(16, 163, 127) teal/emerald
    static let avatarAssistant = Color(red: 16/255, green: 163/255, blue: 127/255)

    /// System avatar — web: rgb(126, 163, 227) light blue
    static let avatarSystem = Color(red: 126/255, green: 163/255, blue: 227/255)

    // MARK: - Branch Editor Node Role Colors (matching web)

    /// User node border — web: blue
    static let nodeRoleUser = Color(red: 0x3b/255, green: 0x82/255, blue: 0xf6/255) // #3b82f6

    /// Assistant node border — web: emerald
    static let nodeRoleAssistant = Color(red: 0x04/255, green: 0x78/255, blue: 0x57/255) // #047857

    /// System node border — web: violet
    static let nodeRoleSystem = Color(red: 0x6d/255, green: 0x28/255, blue: 0xd9/255) // #6d28d9

    // MARK: - Branch Editor Node Backgrounds

    /// Active node background
    static let nodeActiveBackground = Color("NodeActiveBackground")

    /// Inactive node background
    static let nodeInactiveBackground = Color("NodeInactiveBackground")
}
