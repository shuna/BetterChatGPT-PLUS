//
//  Weavelet_CanvasApp.swift
//  Weavelet Canvas
//
//  Created by suzuki on 2026/03/26.
//

import SwiftUI

@main
struct Weavelet_CanvasApp: App {
    @State private var chatViewModel = ChatViewModel()
    @State private var settings = SettingsViewModel()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            ContentView(chatViewModel: chatViewModel, settings: settings)
                .preferredColorScheme(settings.themeMode.colorScheme)
        }
        .onChange(of: scenePhase) { _, newPhase in
            if newPhase == .background {
                chatViewModel.flush()
            }
        }
    }
}
