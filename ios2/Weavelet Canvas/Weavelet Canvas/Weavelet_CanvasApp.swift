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
    @State private var cloudSyncService = CloudSyncService()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            ContentView(chatViewModel: chatViewModel, settings: settings)
                .preferredColorScheme(settings.themeMode.colorScheme)
                .onAppear {
                    chatViewModel.settings = settings
                    setupCloudSync()
                }
        }
        .onChange(of: scenePhase) { _, newPhase in
            if newPhase == .background {
                chatViewModel.flush()
                Task { await chatViewModel.streamRecovery.flush() }
                Task { await cloudSyncService.flushPendingSync() }
            }
        }
    }

    private func setupCloudSync() {
        guard settings.cloudSyncEnabled else { return }

        // Propagate snapshot timestamps to settings for conflict resolution
        cloudSyncService.onTimestampUpdate = { [settings] updatedAt in
            Task { @MainActor in settings.lastLocalUpdatedAt = updatedAt }
        }

        // Wire PersistenceService save callback to cloud sync
        Task {
            await chatViewModel.persistence.onSaveComplete = { [cloudSyncService] state in
                cloudSyncService.scheduleUpload(state)
            }
        }

        // Set up provider and pull remote state
        Task {
            let provider: any CloudSyncProvider
            switch settings.cloudSyncProviderType {
            case .icloud:
                provider = CloudKitSyncProvider()
            case .googleDrive:
                provider = GoogleDriveSyncProvider()
            }

            guard await provider.checkAuth() else { return }
            await cloudSyncService.setProvider(provider)

            // Pull remote state on startup
            if let currentState = await chatViewModel.persistence.load() {
                if let updatedState = await cloudSyncService.pullRemoteState(
                    localState: currentState,
                    localUpdatedAt: settings.lastLocalUpdatedAt
                ) {
                    await MainActor.run { chatViewModel.applyRemoteState(updatedState) }
                }
            }
        }
    }
}
