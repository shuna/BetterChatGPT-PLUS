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
            HomeIndicatorAutoHiddenView {
                ContentView(chatViewModel: chatViewModel, settings: settings)
                    .preferredColorScheme(settings.themeMode.colorScheme)
                    .onAppear {
                        chatViewModel.settings = settings
                        setupCloudSync()
                    }
                    .task {
                        // Patch the outer hosting view's systemBackgroundColor to match app background
                        try? await Task.sleep(for: .milliseconds(100))
                        await MainActor.run {
                            guard let windowScene = UIApplication.shared.connectedScenes
                                .compactMap({ $0 as? UIWindowScene }).first,
                                  let window = windowScene.windows.first else { return }
                            let appBg = UIColor(named: "AppBackground")
                            func findAndPatch(_ view: UIView) {
                                if view.backgroundColor == .systemBackground {
                                    view.backgroundColor = appBg
                                    return
                                }
                                for sub in view.subviews { findAndPatch(sub) }
                            }
                            findAndPatch(window)
                        }
                    }
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
