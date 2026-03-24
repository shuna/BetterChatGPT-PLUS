import SwiftUI
import WeaveletDomain

/// 4-step welcome wizard matching Web version's onboarding flow.
struct WelcomeWizardView: View {
    @Environment(AppState.self) private var appState
    @Binding var isPresented: Bool
    @State private var currentStep = 0

    var body: some View {
        VStack(spacing: 0) {
            // Progress dots
            HStack(spacing: 8) {
                ForEach(0..<4, id: \.self) { step in
                    Circle()
                        .fill(step <= currentStep ? Color.accentColor : Color(.systemGray4))
                        .frame(width: 8, height: 8)
                }
            }
            .padding(.top, 20)

            // Step content
            TabView(selection: $currentStep) {
                welcomeStep.tag(0)
                apiSetupStep.tag(1)
                modelSelectStep.tag(2)
                readyStep.tag(3)
            }
            .tabViewStyle(.page(indexDisplayMode: .never))

            // Navigation buttons
            HStack {
                if currentStep > 0 {
                    Button("Back") {
                        withAnimation { currentStep -= 1 }
                    }
                    .buttonStyle(.bordered)
                }

                Spacer()

                if currentStep < 3 {
                    Button("Next") {
                        withAnimation { currentStep += 1 }
                    }
                    .buttonStyle(.borderedProminent)
                } else {
                    Button("Get Started") {
                        UserDefaults.standard.set(true, forKey: "onboardingComplete")
                        isPresented = false
                    }
                    .buttonStyle(.borderedProminent)
                }
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 24)
        }
        .interactiveDismissDisabled()
    }

    // MARK: - Steps

    @ViewBuilder
    private var welcomeStep: some View {
        VStack(spacing: 16) {
            Spacer()
            Image(systemName: "bubble.left.and.text.bubble.right")
                .font(.system(size: 64))
                .foregroundStyle(Color.accentColor)
            Text("Welcome to Weavelet Canvas")
                .font(.title2.bold())
            Text("A branching conversation editor for LLMs. Explore multiple response paths, compare outputs, and manage your AI conversations.")
                .font(.body)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
            Spacer()
        }
    }

    @ViewBuilder
    private var apiSetupStep: some View {
        VStack(spacing: 16) {
            Spacer()
            Image(systemName: "key.fill")
                .font(.system(size: 64))
                .foregroundStyle(.orange)
            Text("Connect an AI Provider")
                .font(.title2.bold())
            Text("Add an API key from OpenRouter, OpenAI, or any compatible provider to start chatting.")
                .font(.body)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)

            // Quick API key entry for OpenRouter (free models available)
            VStack(spacing: 8) {
                Text("OpenRouter (recommended — has free models)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                SecureField("OpenRouter API Key", text: Binding(
                    get: { appState.settings.providers[.openrouter]?.apiKey ?? "" },
                    set: { newValue in
                        if appState.settings.providers[.openrouter] == nil {
                            appState.settings.providers[.openrouter] = ProviderConfig(
                                id: .openrouter, name: "OpenRouter",
                                endpoint: "https://openrouter.ai/api/v1/chat/completions",
                                modelsEndpoint: "https://openrouter.ai/api/v1/models",
                                modelsRequireAuth: false
                            )
                        }
                        appState.settings.providers[.openrouter]?.apiKey = newValue.isEmpty ? nil : newValue
                    }
                ))
                .textFieldStyle(.roundedBorder)
                .padding(.horizontal, 32)
            }
            Spacer()
        }
    }

    @ViewBuilder
    private var modelSelectStep: some View {
        VStack(spacing: 16) {
            Spacer()
            Image(systemName: "cpu")
                .font(.system(size: 64))
                .foregroundStyle(.purple)
            Text("Choose a Model")
                .font(.title2.bold())
            Text("Select a default model. You can change this per-chat at any time from the model dropdown.")
                .font(.body)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)

            // Quick model suggestions
            VStack(spacing: 4) {
                modelSuggestion("gpt-4o", provider: .openai, desc: "Fast & capable")
                modelSuggestion("claude-sonnet-4-20250514", provider: .openrouter, desc: "Strong reasoning")
                modelSuggestion("deepseek/deepseek-chat-v3-0324:free", provider: .openrouter, desc: "Free tier")
            }
            .padding(.horizontal, 32)
            Spacer()
        }
    }

    @ViewBuilder
    private func modelSuggestion(_ modelId: String, provider: ProviderId, desc: String) -> some View {
        Button {
            appState.settings.defaultChatConfig.model = modelId
            appState.settings.defaultChatConfig.providerId = provider
        } label: {
            HStack {
                VStack(alignment: .leading) {
                    Text(modelId).font(.callout)
                    Text(desc).font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                if appState.settings.defaultChatConfig.model == modelId {
                    Image(systemName: "checkmark.circle.fill").foregroundStyle(.green)
                }
            }
            .padding(8)
            .background(
                appState.settings.defaultChatConfig.model == modelId
                    ? Color.accentColor.opacity(0.1)
                    : Color(.systemGray6),
                in: RoundedRectangle(cornerRadius: 8)
            )
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private var readyStep: some View {
        VStack(spacing: 16) {
            Spacer()
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 64))
                .foregroundStyle(.green)
            Text("You're All Set!")
                .font(.title2.bold())
            Text("Start a new chat, branch conversations, and explore the power of multi-path AI dialogue.")
                .font(.body)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)

            VStack(alignment: .leading, spacing: 8) {
                tipRow("point.3.connected.trianglepath.dotted", "Branch to explore alternatives")
                tipRow("arrow.left.arrow.right", "Compare different responses")
                tipRow("star.fill", "Favorite models for quick access")
                tipRow("square.and.arrow.up", "Export in multiple formats")
            }
            .padding(.horizontal, 32)
            Spacer()
        }
    }

    @ViewBuilder
    private func tipRow(_ icon: String, _ text: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: icon)
                .font(.caption)
                .foregroundStyle(Color.accentColor)
                .frame(width: 20)
            Text(text)
                .font(.callout)
        }
    }
}
