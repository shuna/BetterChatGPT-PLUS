import SwiftUI

struct CloudSyncSettingsView: View {
    @Bindable var settings: SettingsViewModel
    var cloudSyncService: CloudSyncService

    var body: some View {
        Form {
            Section("Provider") {
                Picker("Cloud provider", selection: $settings.cloudSyncProviderType) {
                    ForEach(CloudSyncProviderType.allCases) { type in
                        Text(type.label).tag(type)
                    }
                }
            }

            Section("Status") {
                HStack {
                    Text("Status")
                    Spacer()
                    statusBadge
                }

                if let timestamp = cloudSyncService.lastSyncTimestamp ?? settings.lastSyncTimestamp {
                    LabeledContent("Last synced") {
                        Text(timestamp, style: .relative)
                            .foregroundStyle(.secondary)
                    }
                }

                if let error = cloudSyncService.lastError {
                    Text(error)
                        .font(.caption)
                        .foregroundStyle(.red)
                }
            }

            Section {
                if cloudSyncService.syncStatus == .unauthenticated {
                    Button("Connect") {
                        Task { await connect() }
                    }
                } else {
                    Button("Sync Now") {
                        Task { await cloudSyncService.flushPendingSync() }
                    }
                    .disabled(cloudSyncService.syncStatus == .syncing)

                    Button("Disconnect", role: .destructive) {
                        Task { await disconnect() }
                    }
                }
            }
        }
        .navigationTitle("Cloud Sync")
        .navigationBarTitleDisplayMode(.inline)
    }

    @ViewBuilder
    private var statusBadge: some View {
        switch cloudSyncService.syncStatus {
        case .unauthenticated:
            Label("Not connected", systemImage: "xmark.circle")
                .foregroundStyle(.secondary)
        case .syncing:
            Label("Syncing…", systemImage: "arrow.triangle.2.circlepath")
                .foregroundStyle(.blue)
        case .synced:
            Label("Synced", systemImage: "checkmark.circle.fill")
                .foregroundStyle(.green)
        }
    }

    private func connect() async {
        let provider: any CloudSyncProvider
        switch settings.cloudSyncProviderType {
        case .icloud:
            provider = CloudKitSyncProvider()
        case .googleDrive:
            provider = GoogleDriveSyncProvider()
        }

        do {
            try await provider.authenticate()
            await cloudSyncService.setProvider(provider)
            settings.cloudSyncEnabled = true
        } catch {
            cloudSyncService.lastError = error.localizedDescription
        }
    }

    private func disconnect() async {
        await cloudSyncService.disconnect()
        settings.cloudSyncEnabled = false
        settings.lastSyncTimestamp = nil
    }
}
