import SwiftUI

@main
struct Weavelet_CanvasApp: App {
    @State private var appState = AppState()
    @State private var showOnboarding = !UserDefaults.standard.bool(forKey: "onboardingComplete")
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            AdaptiveRootView()
                .environment(appState)
                .preferredColorScheme(appState.settings.theme.colorScheme)
                .sheet(isPresented: $showOnboarding) {
                    WelcomeWizardView(isPresented: $showOnboarding)
                        .environment(appState)
                }
                .onChange(of: scenePhase) { _, newPhase in
                    switch newPhase {
                    case .background, .inactive:
                        appState.saveAll()
                    case .active:
                        break
                    @unknown default:
                        break
                    }
                }
        }
    }
}
