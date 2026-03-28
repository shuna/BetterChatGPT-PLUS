//
//  ContentView.swift
//  3column
//
//  Created by suzuki on 2026/02/19.
//

import SwiftUI

struct ContentView: View {
    enum BottomNavigationPlacement: String, CaseIterable, Identifiable {
        case leading
        case trailing

        var id: Self { self }
    }

    @State private var sliderValue: Double = 0.5
    @State private var bottomNavigationPlacement: BottomNavigationPlacement = .leading
    @State private var threeColumnState = ThreeColumnState()

    var body: some View {
        ThreePaneView(
            state: threeColumnState,
            Sidebar: { ExampleSidebarView() },
            Detail: {
                ExampleDetailView(
                    sliderValue: sliderValue,
                    bottomNavigationPlacement: $bottomNavigationPlacement,
                    toolbarsHidden: Binding(
                        get: { threeColumnState.toolbarsHidden },
                        set: { threeColumnState.toolbarsHidden = $0 }
                    )
                )
            },
            sidebarToolbarCenter: { _, _ in
                Button {

                } label: {
                    Image(systemName: "plus")
                }
                .accessibilityLabel("Add")
            },
            sidebarToolbarTrailing: { _, _ in
                Button(role: .destructive) {

                } label: {
                    Image(systemName: "trash")
                }
                .accessibilityLabel("Delete")
            },
            detailToolbarLeading: { _, _ in
                EmptyView()
            },
            detailToolbarCenter: { _, _ in
                EmptyView()
            },
            detailToolbarTrailing: { _, _ in
                EmptyView()
            },
            detailToolbarBottomLeading: { _, _ in
                if bottomNavigationPlacement == .leading {
                    stepButtonsToolbar
                } else {
                    EmptyView()
                }
            },
            detailToolbarBottomTrailing: { _, _ in
                if bottomNavigationPlacement == .trailing {
                    stepButtonsToolbar
                } else {
                    EmptyView()
                }
            },
            detailToolbarBottomStatus: { _, _ in
                sliderToolbar
            },
            inspectorToolbarCenter: { _, _ in
                EmptyView()
            },
            inspectorToolbarTrailing: { _, _ in
                EmptyView()
            }
        )
    }

    @ViewBuilder
    private var sliderToolbar: some View {
        Group {
            Slider(value: $sliderValue, in: 0...1)
                .accessibilityLabel("Example Slider")
        }
    }

    @ViewBuilder
    private var stepButtonsToolbar: some View {
        HStack(spacing: 16) {
            Button {
                sliderValue = max(0, sliderValue - 0.1)
            } label: {
                Image(systemName: "chevron.left")
            }
            .accessibilityLabel("Decrease Slider")

            Button {
                sliderValue = min(1, sliderValue + 0.1)
            } label: {
                Image(systemName: "chevron.right")
            }
            .accessibilityLabel("Increase Slider")
        }
    }
}

private struct ExampleSidebarView: View {
    var body: some View {
        List {
            Text("Sidebar Skeleton")
                .foregroundStyle(.secondary)
        }
    }
}

private struct ExampleDetailView: View {
    let sliderValue: Double
    @Binding var bottomNavigationPlacement: ContentView.BottomNavigationPlacement
    @Binding var toolbarsHidden: Bool

    var body: some View {
        ScrollView {
            Toggle("Hide All Toolbars", isOn: $toolbarsHidden)
                .padding(.horizontal)
                .padding(.top)

            Picker("Buttons Position", selection: $bottomNavigationPlacement) {
                Text("Buttons Left").tag(ContentView.BottomNavigationPlacement.leading)
                Text("Buttons Right").tag(ContentView.BottomNavigationPlacement.trailing)
            }
            .pickerStyle(.segmented)
            .padding(.horizontal)
            .padding(.top, 8)

            Text("Slider: \(sliderValue, format: .number.precision(.fractionLength(2)))")
                .font(.headline)
                .padding(.horizontal)
                .padding(.top, 4)

            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: [
                            Color(red: 0.20, green: 0.45, blue: 0.98),
                            Color(red: 0.08, green: 0.78, blue: 0.72)
                        ],
                        startPoint: .leading,
                        endPoint: .trailing
                    )
                )
                .frame(height: 220)
                .padding()
        }
    }
}

#Preview("iPhone") {
    ContentView()
}

#Preview("iPad") {
    ContentView()
}
#Preview("Mac") {
    ContentView()
}
