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
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            ContentView(chatViewModel: chatViewModel)
        }
        .onChange(of: scenePhase) { _, newPhase in
            if newPhase == .background {
                chatViewModel.flush()
            }
        }
    }
}
