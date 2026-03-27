//
//  ThreePaneView.swift
//  3column
//
//  Created by Codex on 2026/02/20.
//

import SwiftUI
import Observation

// MARK: - Split Panel Environment

private struct SplitPanelSwappedKey: EnvironmentKey {
    static let defaultValue = false
}

extension EnvironmentValues {
    var splitPanelSwapped: Bool {
        get { self[SplitPanelSwappedKey.self] }
        set { self[SplitPanelSwappedKey.self] = newValue }
    }
}


struct ThreeColumnButtonIcons {
    var showSidebarCompact: String = "list.bullet"
    var showSidebarRegular: String = "sidebar.left"
    var hideSidebarCompact: String = "xmark.circle"
    var hideSidebarRegular: String = "sidebar.left"
    var showInspectorCompact: String = "slider.horizontal.3"
    var showInspectorRegular: String = "sidebar.right"
    var hideInspectorCompact: String = "xmark.circle"
    var hideInspectorRegular: String = "sidebar.trailing"
}

struct ThreeColumnButtonLabels {
    var showSidebar: String = "Show Sidebar"
    var hideSidebar: String = "Hide Sidebar"
    var showInspector: String = "Show Inspector"
    var hideInspector: String = "Hide Inspector"

    var showSidebarAccessibilityCompact: String = "Show List"
    var showSidebarAccessibilityRegular: String = "Show Sidebar"
    var hideSidebarAccessibilityCompact: String = "Hide List"
    var hideSidebarAccessibilityRegular: String = "Hide Sidebar"
    var showInspectorAccessibilityCompact: String = "Show Inspector"
    var showInspectorAccessibilityRegular: String = "Show Inspector"
    var hideInspectorAccessibilityCompact: String = "Hide Inspector"
    var hideInspectorAccessibilityRegular: String = "Hide Inspector"
}

struct ThreeColumnNavigationTitles {
    var sidebar: String = "Sidebar"
    var detail: String = "Detail"
    var inspector: String = "Inspector"
}

@Observable
final class ThreeColumnState {
    var inspectorPresented: Bool = false
    var splitViewVisibility: NavigationSplitViewVisibility = .detailOnly
    var sidebarSheetPresented: Bool = false
    var toolbarsHidden: Bool = false
    var inspectorWidth: CGFloat = {
        // Restore saved width, or use 0 as sentinel for "use half screen"
        UserDefaults.standard.double(forKey: "inspectorWidth")
    }()
    /// Whether the user has explicitly dragged the divider
    var inspectorWidthUserSet: Bool = UserDefaults.standard.bool(forKey: "inspectorWidthUserSet")
    var showsDefaultInspectorButton: Bool = true
    /// Default inspector width ratio (0–1 of total width), set from settings.
    var defaultRatio: Double = 0.5
    static let inspectorMinWidth: CGFloat = 240
    static let inspectorMaxWidth: CGFloat = 600

    func saveInspectorWidth() {
        UserDefaults.standard.set(inspectorWidth, forKey: "inspectorWidth")
        UserDefaults.standard.set(true, forKey: "inspectorWidthUserSet")
        inspectorWidthUserSet = true
    }

    var sidebarPresented: Bool {
        get { splitViewVisibility != .detailOnly }
        set { splitViewVisibility = newValue ? .all : .detailOnly }
    }
}

struct ThreeColumnEnvironment {
    let isCompactWidth: Bool
    let icons: ThreeColumnButtonIcons
    let labels: ThreeColumnButtonLabels
}

struct ThreeColumnViewState {
    fileprivate let state: ThreeColumnState
    fileprivate let env: ThreeColumnEnvironment

    var isCompactWidth: Bool { env.isCompactWidth }

    var inspectorPresented: Bool { state.inspectorPresented }
    var showsDefaultInspectorButton: Bool { state.showsDefaultInspectorButton }

    var sidebarPresented: Bool {
        isCompactWidth ? state.sidebarSheetPresented : state.sidebarPresented
    }

    var showSidebarIcon: String {
        isCompactWidth ? env.icons.showSidebarCompact : env.icons.showSidebarRegular
    }

    var hideSidebarIcon: String {
        isCompactWidth ? env.icons.hideSidebarCompact : env.icons.hideSidebarRegular
    }

    var showInspectorIcon: String {
        isCompactWidth ? env.icons.showInspectorCompact : env.icons.showInspectorRegular
    }

    var hideInspectorIcon: String {
        isCompactWidth ? env.icons.hideInspectorCompact : env.icons.hideInspectorRegular
    }

    var showSidebarLabel: String { env.labels.showSidebar }
    var hideSidebarLabel: String { env.labels.hideSidebar }
    var showInspectorLabel: String { env.labels.showInspector }
    var hideInspectorLabel: String { env.labels.hideInspector }

    var showSidebarAccessibilityLabel: String {
        isCompactWidth ? env.labels.showSidebarAccessibilityCompact : env.labels.showSidebarAccessibilityRegular
    }

    var hideSidebarAccessibilityLabel: String {
        isCompactWidth ? env.labels.hideSidebarAccessibilityCompact : env.labels.hideSidebarAccessibilityRegular
    }

    var showInspectorAccessibilityLabel: String {
        isCompactWidth ? env.labels.showInspectorAccessibilityCompact : env.labels.showInspectorAccessibilityRegular
    }

    var hideInspectorAccessibilityLabel: String {
        isCompactWidth ? env.labels.hideInspectorAccessibilityCompact : env.labels.hideInspectorAccessibilityRegular
    }

    var toolbarsHidden: Bool { state.toolbarsHidden }
}

struct ThreeColumnActions {
    fileprivate let state: ThreeColumnState
    fileprivate let env: ThreeColumnEnvironment

    private var isCompactWidth: Bool { env.isCompactWidth }

    func setInspectorPresented(_ isPresented: Bool) {
        state.inspectorPresented = isPresented
    }

    func setSidebarPresented(_ isPresented: Bool) {
        if isCompactWidth {
            state.sidebarSheetPresented = isPresented
        } else {
            state.sidebarPresented = isPresented
        }
    }

    func showSidebar() {
        setSidebarPresented(true)
    }

    func hideSidebar() {
        setSidebarPresented(false)
    }

    func toggleInspector() {
        setInspectorPresented(!state.inspectorPresented)
    }

    func setToolbarsHidden(_ isHidden: Bool) {
        state.toolbarsHidden = isHidden
    }

    func toggleToolbars() {
        state.toolbarsHidden.toggle()
    }
}

struct ThreePaneView<Sidebar: View, Detail: View, Inspector: View>: View {
    @State private var state: ThreeColumnState
    @Environment(\.isCompactWidth) private var isCompact
    @Environment(\.splitPanelSwapped) private var splitPanelSwapped
    private let icons: ThreeColumnButtonIcons
    private let labels: ThreeColumnButtonLabels
    private let appliesDefaultChrome: Bool
    private let sidebarToolbarCenter: (ThreeColumnViewState, ThreeColumnActions) -> AnyView?
    private let sidebarToolbarTrailing: (ThreeColumnViewState, ThreeColumnActions) -> AnyView?
    private let detailToolbarLeading: (ThreeColumnViewState, ThreeColumnActions) -> AnyView?
    private let detailToolbarCenter: (ThreeColumnViewState, ThreeColumnActions) -> AnyView?
    private let detailToolbarTrailing: (ThreeColumnViewState, ThreeColumnActions) -> AnyView?
    private let detailToolbarBottomLeading: (ThreeColumnViewState, ThreeColumnActions) -> AnyView?
    private let detailToolbarBottomTrailing: (ThreeColumnViewState, ThreeColumnActions) -> AnyView?
    private let detailToolbarBottomStatus: (ThreeColumnViewState, ThreeColumnActions) -> AnyView?
    private let sidebar: (ThreeColumnViewState, ThreeColumnActions) -> Sidebar
    private let detail: (ThreeColumnViewState, ThreeColumnActions) -> Detail
    private let inspector: (ThreeColumnViewState, ThreeColumnActions) -> Inspector

    init(
        state: ThreeColumnState = ThreeColumnState(),
        icons: ThreeColumnButtonIcons = .init(),
        labels: ThreeColumnButtonLabels = .init(),
        appliesDefaultChrome: Bool = false,
        sidebarToolbarCenter: @escaping (ThreeColumnViewState, ThreeColumnActions) -> AnyView? = { _, _ in nil },
        sidebarToolbarTrailing: @escaping (ThreeColumnViewState, ThreeColumnActions) -> AnyView? = { _, _ in nil },
        detailToolbarLeading: @escaping (ThreeColumnViewState, ThreeColumnActions) -> AnyView? = { _, _ in nil },
        detailToolbarCenter: @escaping (ThreeColumnViewState, ThreeColumnActions) -> AnyView? = { _, _ in nil },
        detailToolbarTrailing: @escaping (ThreeColumnViewState, ThreeColumnActions) -> AnyView? = { _, _ in nil },
        detailToolbarBottomLeading: @escaping (ThreeColumnViewState, ThreeColumnActions) -> AnyView? = { _, _ in nil },
        detailToolbarBottomTrailing: @escaping (ThreeColumnViewState, ThreeColumnActions) -> AnyView? = { _, _ in nil },
        detailToolbarBottomStatus: @escaping (ThreeColumnViewState, ThreeColumnActions) -> AnyView? = { _, _ in nil },
        @ViewBuilder sidebar: @escaping (ThreeColumnViewState, ThreeColumnActions) -> Sidebar,
        @ViewBuilder detail: @escaping (ThreeColumnViewState, ThreeColumnActions) -> Detail,
        @ViewBuilder inspector: @escaping (ThreeColumnViewState, ThreeColumnActions) -> Inspector
    ) {
        _state = State(initialValue: state)
        self.icons = icons
        self.labels = labels
        self.appliesDefaultChrome = appliesDefaultChrome
        self.sidebarToolbarCenter = sidebarToolbarCenter
        self.sidebarToolbarTrailing = sidebarToolbarTrailing
        self.detailToolbarLeading = detailToolbarLeading
        self.detailToolbarCenter = detailToolbarCenter
        self.detailToolbarTrailing = detailToolbarTrailing
        self.detailToolbarBottomLeading = detailToolbarBottomLeading
        self.detailToolbarBottomTrailing = detailToolbarBottomTrailing
        self.detailToolbarBottomStatus = detailToolbarBottomStatus
        self.sidebar = sidebar
        self.detail = detail
        self.inspector = inspector
    }

    init(
        state: ThreeColumnState = ThreeColumnState(),
        icons: ThreeColumnButtonIcons = .init(),
        labels: ThreeColumnButtonLabels = .init(),
        appliesDefaultChrome: Bool = false,
        sidebarToolbarCenter: @escaping (ThreeColumnViewState, ThreeColumnActions) -> AnyView? = { _, _ in nil },
        sidebarToolbarTrailing: @escaping (ThreeColumnViewState, ThreeColumnActions) -> AnyView? = { _, _ in nil },
        detailToolbarLeading: @escaping (ThreeColumnViewState, ThreeColumnActions) -> AnyView? = { _, _ in nil },
        detailToolbarCenter: @escaping (ThreeColumnViewState, ThreeColumnActions) -> AnyView? = { _, _ in nil },
        detailToolbarTrailing: @escaping (ThreeColumnViewState, ThreeColumnActions) -> AnyView? = { _, _ in nil },
        detailToolbarBottom: @escaping (ThreeColumnViewState, ThreeColumnActions) -> AnyView?,
        @ViewBuilder sidebar: @escaping (ThreeColumnViewState, ThreeColumnActions) -> Sidebar,
        @ViewBuilder detail: @escaping (ThreeColumnViewState, ThreeColumnActions) -> Detail,
        @ViewBuilder inspector: @escaping (ThreeColumnViewState, ThreeColumnActions) -> Inspector
    ) {
        self.init(
            state: state,
            icons: icons,
            labels: labels,
            appliesDefaultChrome: appliesDefaultChrome,
            sidebarToolbarCenter: sidebarToolbarCenter,
            sidebarToolbarTrailing: sidebarToolbarTrailing,
            detailToolbarLeading: detailToolbarLeading,
            detailToolbarCenter: detailToolbarCenter,
            detailToolbarTrailing: detailToolbarTrailing,
            detailToolbarBottomLeading: detailToolbarBottom,
            detailToolbarBottomTrailing: { _, _ in nil },
            detailToolbarBottomStatus: { _, _ in nil },
            sidebar: sidebar,
            detail: detail,
            inspector: inspector
        )
    }

    var body: some View {
        let env = ThreeColumnEnvironment(isCompactWidth: isCompact, icons: icons, labels: labels)
        let viewState = ThreeColumnViewState(state: state, env: env)
        let actions = ThreeColumnActions(state: state, env: env)

        Group {
            if isCompact {
                detailView(viewState: viewState, actions: actions)
                    .sheet(isPresented: $state.sidebarSheetPresented) {
                        sidebarView(viewState: viewState, actions: actions)
                    }
                    .sheet(isPresented: $state.inspectorPresented) {
                        inspector(viewState, actions)
                    }
            } else {
                HStack(spacing: 0) {
                    if splitPanelSwapped && state.inspectorPresented {
                        inspector(viewState, actions)
                            .frame(width: state.inspectorWidth)
                            .transition(.move(edge: .leading))

                        InspectorDragHandle(
                            inspectorWidth: $state.inspectorWidth,
                            onDragEnd: { state.saveInspectorWidth() }
                        )
                    }

                    NavigationSplitView(columnVisibility: $state.splitViewVisibility) {
                        sidebarView(viewState: viewState, actions: actions)
                    } detail: {
                        detailView(viewState: viewState, actions: actions)
                    }
                    .layoutPriority(1)

                    if !splitPanelSwapped && state.inspectorPresented {
                        InspectorDragHandle(
                            inspectorWidth: $state.inspectorWidth,
                            onDragEnd: { state.saveInspectorWidth() }
                        )

                        inspector(viewState, actions)
                            .frame(width: state.inspectorWidth)
                            .transition(.move(edge: .trailing))
                    }
                }
                .animation(.spring(duration: 0.3, bounce: 0.0), value: state.inspectorPresented)
                .onGeometryChange(for: CGFloat.self) { proxy in
                    proxy.size.width
                } action: { totalWidth in
                    // Set initial inspector width from settings ratio if not user-set
                    if !state.inspectorWidthUserSet && totalWidth > 0 {
                        let target = totalWidth * state.defaultRatio
                        let clamped = min(max(target, ThreeColumnState.inspectorMinWidth), ThreeColumnState.inspectorMaxWidth)
                        state.inspectorWidth = clamped
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func sidebarView(viewState: ThreeColumnViewState, actions: ThreeColumnActions) -> some View {
        if appliesDefaultChrome {
            SidebarPaneContainer(
                viewState: viewState,
                actions: actions,
                centerToolbar: sidebarToolbarCenter(viewState, actions),
                trailingToolbar: sidebarToolbarTrailing(viewState, actions)
            ) {
                sidebar(viewState, actions)
            }
        } else {
            sidebar(viewState, actions)
        }
    }

    @ViewBuilder
    private func detailView(viewState: ThreeColumnViewState, actions: ThreeColumnActions) -> some View {
        if appliesDefaultChrome {
            DetailPaneContainer(
                viewState: viewState,
                actions: actions,
                leadingToolbar: detailToolbarLeading(viewState, actions),
                centerToolbar: detailToolbarCenter(viewState, actions),
                trailingToolbar: detailToolbarTrailing(viewState, actions),
                bottomLeadingToolbar: detailToolbarBottomLeading(viewState, actions),
                bottomTrailingToolbar: detailToolbarBottomTrailing(viewState, actions),
                bottomStatusToolbar: detailToolbarBottomStatus(viewState, actions)
            ) {
                detail(viewState, actions)
            }
        } else {
            detail(viewState, actions)
        }
    }
}

struct DefaultSidebarView: View {
    let viewState: ThreeColumnViewState
    let actions: ThreeColumnActions

    var body: some View {
        SidebarPaneContainer(viewState: viewState, actions: actions, centerToolbar: nil, trailingToolbar: nil) {
            EmptyView()
        }
    }
}

struct DefaultDetailView: View {
    let viewState: ThreeColumnViewState
    let actions: ThreeColumnActions

    var body: some View {
        DetailPaneContainer(
            viewState: viewState,
            actions: actions,
            leadingToolbar: nil,
            centerToolbar: nil,
            trailingToolbar: nil,
            bottomLeadingToolbar: nil,
            bottomTrailingToolbar: nil,
            bottomStatusToolbar: nil
        ) {
            EmptyView()
        }
    }
}

// MARK: - Inspector Drag Handle

private struct InspectorDragHandle: View {
    @Binding var inspectorWidth: CGFloat
    var onDragEnd: (() -> Void)? = nil
    @State private var dragStartWidth: CGFloat = 0
    @GestureState private var isDragging = false

    private let dotSize: CGFloat = 3
    private let dotSpacingH: CGFloat = 4  // horizontal gap between 2 columns
    private let dotSpacingV: CGFloat = 4  // vertical gap between dots
    private let dotCount = 5              // dots per column

    var body: some View {
        ZStack {
            // Separator line
            Rectangle()
                .fill(Color(.separator).opacity(0.3))
                .frame(width: 1)

            // 2-column dot grid
            HStack(spacing: dotSpacingH) {
                ForEach(0..<2, id: \.self) { _ in
                    VStack(spacing: dotSpacingV) {
                        ForEach(0..<dotCount, id: \.self) { _ in
                            Circle()
                                .fill(Color(.tertiaryLabel))
                                .frame(width: dotSize, height: dotSize)
                        }
                    }
                }
            }
            .opacity(isDragging ? 1.0 : 0.5)
            .animation(.easeInOut(duration: 0.15), value: isDragging)
        }
        .frame(width: 14)
        .contentShape(Rectangle())
        .gesture(
            DragGesture(coordinateSpace: .global)
                .updating($isDragging) { _, state, _ in state = true }
                .onChanged { value in
                    if dragStartWidth == 0 { dragStartWidth = inspectorWidth }
                    let newWidth = dragStartWidth - value.translation.width
                    var transaction = Transaction()
                    transaction.disablesAnimations = true
                    withTransaction(transaction) {
                        inspectorWidth = min(max(newWidth, ThreeColumnState.inspectorMinWidth), ThreeColumnState.inspectorMaxWidth)
                    }
                }
                .onEnded { _ in
                    dragStartWidth = 0
                    onDragEnd?()
                }
        )
        .hoverEffect(.highlight)
    }
}

struct DefaultInspectorView<Content: View>: View {
    let viewState: ThreeColumnViewState
    let actions: ThreeColumnActions
    let centerToolbar: AnyView?
    let trailingToolbar: AnyView?
    let content: Content
    @Environment(\.threeColumnNavigationTitles) private var navigationTitles

    init(
        viewState: ThreeColumnViewState,
        actions: ThreeColumnActions,
        centerToolbar: AnyView?,
        trailingToolbar: AnyView?,
        @ViewBuilder content: () -> Content
    ) {
        self.viewState = viewState
        self.actions = actions
        self.centerToolbar = centerToolbar
        self.trailingToolbar = trailingToolbar
        self.content = content()
    }

    var body: some View {
        NavigationStack {
            content
            .navigationTitle(navigationTitles.inspector)
            .toolbar {
                if !viewState.toolbarsHidden {
                    if let centerToolbar {
                        ToolbarItemGroup(placement: .principal) {
                            centerToolbar
                        }
                    }
                    if let trailingToolbar {
                        ToolbarItemGroup(placement: .topBarTrailing) {
                            trailingToolbar
                        }
                    }
                    if viewState.showsDefaultInspectorButton {
                        ToolbarItem(placement: viewState.isCompactWidth ? .topBarLeading : .topBarTrailing) {
                            Button {
                                actions.toggleInspector()
                            } label: {
                                Label(
                                    viewState.inspectorPresented ? viewState.hideInspectorLabel : viewState.showInspectorLabel,
                                    systemImage: viewState.hideInspectorIcon
                                )
                            }
                            .accessibilityLabel(
                                viewState.inspectorPresented
                                ? viewState.hideInspectorAccessibilityLabel
                                : viewState.showInspectorAccessibilityLabel
                            )
                        }
                    }
                }
            }
            .toolbar(viewState.toolbarsHidden ? .hidden : .visible, for: .navigationBar)
            .toolbar(viewState.toolbarsHidden ? .hidden : .visible, for: .bottomBar)
        }
    }
}

extension DefaultInspectorView where Content == EmptyView {
    init(
        viewState: ThreeColumnViewState,
        actions: ThreeColumnActions,
        centerToolbar: AnyView?,
        trailingToolbar: AnyView?
    ) {
        self.viewState = viewState
        self.actions = actions
        self.centerToolbar = centerToolbar
        self.trailingToolbar = trailingToolbar
        self.content = EmptyView()
    }
}

private struct SidebarPaneContainer<Content: View>: View {
    let viewState: ThreeColumnViewState
    let actions: ThreeColumnActions
    let centerToolbar: AnyView?
    let trailingToolbar: AnyView?
    @ViewBuilder let content: Content
    @Environment(\.threeColumnNavigationTitles) private var navigationTitles

    var body: some View {
        NavigationStack {
            content
                .navigationTitle(navigationTitles.sidebar)
                .toolbar {
                    if !viewState.toolbarsHidden {
                        ToolbarItem(placement: .topBarLeading) {
                            Button {
                                actions.hideSidebar()
                            } label: {
                                Label(
                                    viewState.hideSidebarLabel,
                                    systemImage: viewState.hideSidebarIcon
                                )
                            }
                            .accessibilityLabel(viewState.hideSidebarAccessibilityLabel)
                        }
                        if let centerToolbar {
                            ToolbarItemGroup(placement: .principal) {
                                centerToolbar
                            }
                        }
                        if let trailingToolbar {
                            ToolbarItemGroup(placement: .topBarTrailing) {
                                trailingToolbar
                            }
                        }
                    }
                }
                .toolbar(viewState.toolbarsHidden ? .hidden : .visible, for: .navigationBar)
                .toolbar(viewState.toolbarsHidden ? .hidden : .visible, for: .bottomBar)
                .toolbar(removing: .sidebarToggle)
        }
    }
}

private struct DetailPaneContainer<Content: View>: View {
    let viewState: ThreeColumnViewState
    let actions: ThreeColumnActions
    let leadingToolbar: AnyView?
    let centerToolbar: AnyView?
    let trailingToolbar: AnyView?
    let bottomLeadingToolbar: AnyView?
    let bottomTrailingToolbar: AnyView?
    let bottomStatusToolbar: AnyView?
    @ViewBuilder let content: Content
    @Environment(\.threeColumnNavigationTitles) private var navigationTitles

    var body: some View {
        NavigationStack {
            content
                .navigationTitle(navigationTitles.detail)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    if !viewState.toolbarsHidden {
                        if !viewState.sidebarPresented {
                            ToolbarItem(placement: .topBarLeading) {
                                Button {
                                    actions.showSidebar()
                                } label: {
                                    Image(systemName: viewState.showSidebarIcon)
                                }
                                .accessibilityLabel(viewState.showSidebarAccessibilityLabel)
                            }
                        }
                        if let leadingToolbar {
                            ToolbarItemGroup(placement: .topBarLeading) {
                                leadingToolbar
                            }
                        }
                        if let centerToolbar {
                            ToolbarItemGroup(placement: .principal) {
                                centerToolbar
                            }
                        }
                        if let trailingToolbar {
                            ToolbarItemGroup(placement: .topBarTrailing) {
                                trailingToolbar
                            }
                        }
                        if bottomLeadingToolbar != nil || bottomTrailingToolbar != nil {
                            ToolbarItemGroup(placement: .bottomBar) {
                                if let bottomLeadingToolbar, bottomTrailingToolbar == nil {
                                    bottomLeadingToolbar
                                    Spacer(minLength: 0)
                                } else if let bottomTrailingToolbar, bottomLeadingToolbar == nil {
                                    Spacer(minLength: 0)
                                    bottomTrailingToolbar
                                } else {
                                    if let bottomLeadingToolbar {
                                        bottomLeadingToolbar
                                    }
                                    Spacer(minLength: 0)
                                    if let bottomTrailingToolbar {
                                        bottomTrailingToolbar
                                    }
                                }
                            }
                        }
                        if let bottomStatusToolbar {
                            ToolbarItem(placement: .status) {
                                bottomStatusToolbar
                            }
                        }
                    }
                }
                .toolbar(viewState.toolbarsHidden ? .hidden : .visible, for: .navigationBar)
                .toolbar(viewState.toolbarsHidden ? .hidden : .visible, for: .bottomBar)
                .toolbar(removing: .sidebarToggle)
        }
    }
}

extension ThreePaneView where Sidebar == DefaultSidebarView, Detail == DefaultDetailView, Inspector == DefaultInspectorView<EmptyView> {
    init(
        state: ThreeColumnState = ThreeColumnState(),
        icons: ThreeColumnButtonIcons = .init(),
        labels: ThreeColumnButtonLabels = .init()
    ) {
        self.init(state: state, icons: icons, labels: labels) { viewState, actions in
            DefaultSidebarView(viewState: viewState, actions: actions)
        } detail: { viewState, actions in
            DefaultDetailView(viewState: viewState, actions: actions)
        } inspector: { viewState, actions in
            DefaultInspectorView(
                viewState: viewState,
                actions: actions,
                centerToolbar: nil,
                trailingToolbar: nil
            )
        }
    }
}

extension ThreePaneView {
    init(
        state: ThreeColumnState = ThreeColumnState(),
        icons: ThreeColumnButtonIcons = .init(),
        labels: ThreeColumnButtonLabels = .init(),
        @ViewBuilder Sidebar: @escaping () -> Sidebar,
        @ViewBuilder Detail: @escaping () -> Detail,
        @ViewBuilder Inspector: @escaping () -> Inspector
    ) {
        self.init(state: state, icons: icons, labels: labels, appliesDefaultChrome: true) { _, _ in
            Sidebar()
        } detail: { _, _ in
            Detail()
        } inspector: { _, _ in
            Inspector()
        }
    }
}

extension ThreePaneView where Inspector == DefaultInspectorView<EmptyView> {
    init<
        SidebarToolbarCenter: View,
        SidebarToolbarTrailing: View,
        DetailToolbarLeading: View,
        DetailToolbarCenter: View,
        DetailToolbarTrailing: View,
        DetailToolbarBottomLeading: View,
        DetailToolbarBottomTrailing: View,
        DetailToolbarBottomStatus: View,
        InspectorToolbarCenter: View,
        InspectorToolbarTrailing: View
    >(
        state: ThreeColumnState = ThreeColumnState(),
        icons: ThreeColumnButtonIcons = .init(),
        labels: ThreeColumnButtonLabels = .init(),
        @ViewBuilder Sidebar: @escaping () -> Sidebar,
        @ViewBuilder Detail: @escaping () -> Detail,
        @ViewBuilder sidebarToolbarCenter: @escaping (ThreeColumnViewState, ThreeColumnActions) -> SidebarToolbarCenter,
        @ViewBuilder sidebarToolbarTrailing: @escaping (ThreeColumnViewState, ThreeColumnActions) -> SidebarToolbarTrailing,
        @ViewBuilder detailToolbarLeading: @escaping (ThreeColumnViewState, ThreeColumnActions) -> DetailToolbarLeading,
        @ViewBuilder detailToolbarCenter: @escaping (ThreeColumnViewState, ThreeColumnActions) -> DetailToolbarCenter,
        @ViewBuilder detailToolbarTrailing: @escaping (ThreeColumnViewState, ThreeColumnActions) -> DetailToolbarTrailing,
        @ViewBuilder detailToolbarBottomLeading: @escaping (ThreeColumnViewState, ThreeColumnActions) -> DetailToolbarBottomLeading,
        @ViewBuilder detailToolbarBottomTrailing: @escaping (ThreeColumnViewState, ThreeColumnActions) -> DetailToolbarBottomTrailing,
        @ViewBuilder detailToolbarBottomStatus: @escaping (ThreeColumnViewState, ThreeColumnActions) -> DetailToolbarBottomStatus,
        @ViewBuilder inspectorToolbarCenter: @escaping (ThreeColumnViewState, ThreeColumnActions) -> InspectorToolbarCenter,
        @ViewBuilder inspectorToolbarTrailing: @escaping (ThreeColumnViewState, ThreeColumnActions) -> InspectorToolbarTrailing
    ) {
        self.init(
            state: state,
            icons: icons,
            labels: labels,
            appliesDefaultChrome: true,
            sidebarToolbarCenter: { viewState, actions in
                AnyView(sidebarToolbarCenter(viewState, actions))
            },
            sidebarToolbarTrailing: { viewState, actions in
                AnyView(sidebarToolbarTrailing(viewState, actions))
            },
            detailToolbarLeading: { viewState, actions in
                AnyView(detailToolbarLeading(viewState, actions))
            },
            detailToolbarCenter: { viewState, actions in
                AnyView(detailToolbarCenter(viewState, actions))
            },
            detailToolbarTrailing: { viewState, actions in
                AnyView(detailToolbarTrailing(viewState, actions))
            },
            detailToolbarBottomLeading: { viewState, actions in
                AnyView(detailToolbarBottomLeading(viewState, actions))
            },
            detailToolbarBottomTrailing: { viewState, actions in
                AnyView(detailToolbarBottomTrailing(viewState, actions))
            },
            detailToolbarBottomStatus: { viewState, actions in
                AnyView(detailToolbarBottomStatus(viewState, actions))
            }
        ) { _, _ in
            Sidebar()
        } detail: { _, _ in
            Detail()
        } inspector: { viewState, actions in
            DefaultInspectorView(
                viewState: viewState,
                actions: actions,
                centerToolbar: AnyView(inspectorToolbarCenter(viewState, actions)),
                trailingToolbar: AnyView(inspectorToolbarTrailing(viewState, actions))
            )
        }
    }
}

// Variant with custom inspector content
extension ThreePaneView {
    init<
        SidebarToolbarCenter: View,
        SidebarToolbarTrailing: View,
        DetailToolbarLeading: View,
        DetailToolbarCenter: View,
        DetailToolbarTrailing: View,
        DetailToolbarBottomLeading: View,
        DetailToolbarBottomTrailing: View,
        DetailToolbarBottomStatus: View,
        InspectorToolbarCenter: View,
        InspectorToolbarTrailing: View,
        InspectorContent: View
    >(
        state: ThreeColumnState = ThreeColumnState(),
        icons: ThreeColumnButtonIcons = .init(),
        labels: ThreeColumnButtonLabels = .init(),
        @ViewBuilder Sidebar: @escaping () -> Sidebar,
        @ViewBuilder Detail: @escaping () -> Detail,
        @ViewBuilder sidebarToolbarCenter: @escaping (ThreeColumnViewState, ThreeColumnActions) -> SidebarToolbarCenter,
        @ViewBuilder sidebarToolbarTrailing: @escaping (ThreeColumnViewState, ThreeColumnActions) -> SidebarToolbarTrailing,
        @ViewBuilder detailToolbarLeading: @escaping (ThreeColumnViewState, ThreeColumnActions) -> DetailToolbarLeading,
        @ViewBuilder detailToolbarCenter: @escaping (ThreeColumnViewState, ThreeColumnActions) -> DetailToolbarCenter,
        @ViewBuilder detailToolbarTrailing: @escaping (ThreeColumnViewState, ThreeColumnActions) -> DetailToolbarTrailing,
        @ViewBuilder detailToolbarBottomLeading: @escaping (ThreeColumnViewState, ThreeColumnActions) -> DetailToolbarBottomLeading,
        @ViewBuilder detailToolbarBottomTrailing: @escaping (ThreeColumnViewState, ThreeColumnActions) -> DetailToolbarBottomTrailing,
        @ViewBuilder detailToolbarBottomStatus: @escaping (ThreeColumnViewState, ThreeColumnActions) -> DetailToolbarBottomStatus,
        @ViewBuilder inspectorToolbarCenter: @escaping (ThreeColumnViewState, ThreeColumnActions) -> InspectorToolbarCenter,
        @ViewBuilder inspectorToolbarTrailing: @escaping (ThreeColumnViewState, ThreeColumnActions) -> InspectorToolbarTrailing,
        @ViewBuilder inspectorContent: @escaping () -> InspectorContent
    ) where Inspector == DefaultInspectorView<InspectorContent> {
        self.init(
            state: state,
            icons: icons,
            labels: labels,
            appliesDefaultChrome: true,
            sidebarToolbarCenter: { viewState, actions in
                AnyView(sidebarToolbarCenter(viewState, actions))
            },
            sidebarToolbarTrailing: { viewState, actions in
                AnyView(sidebarToolbarTrailing(viewState, actions))
            },
            detailToolbarLeading: { viewState, actions in
                AnyView(detailToolbarLeading(viewState, actions))
            },
            detailToolbarCenter: { viewState, actions in
                AnyView(detailToolbarCenter(viewState, actions))
            },
            detailToolbarTrailing: { viewState, actions in
                AnyView(detailToolbarTrailing(viewState, actions))
            },
            detailToolbarBottomLeading: { viewState, actions in
                AnyView(detailToolbarBottomLeading(viewState, actions))
            },
            detailToolbarBottomTrailing: { viewState, actions in
                AnyView(detailToolbarBottomTrailing(viewState, actions))
            },
            detailToolbarBottomStatus: { viewState, actions in
                AnyView(detailToolbarBottomStatus(viewState, actions))
            }
        ) { _, _ in
            Sidebar()
        } detail: { _, _ in
            Detail()
        } inspector: { viewState, actions in
            DefaultInspectorView(
                viewState: viewState,
                actions: actions,
                centerToolbar: AnyView(inspectorToolbarCenter(viewState, actions)),
                trailingToolbar: AnyView(inspectorToolbarTrailing(viewState, actions))
            ) {
                inspectorContent()
            }
        }
    }
}

extension ThreePaneView where Inspector == DefaultInspectorView<EmptyView> {
    init<
        SidebarToolbarCenter: View,
        SidebarToolbarTrailing: View,
        DetailToolbarLeading: View,
        DetailToolbarCenter: View,
        DetailToolbarTrailing: View,
        DetailToolbarBottomLeading: View,
        DetailToolbarBottomTrailing: View,
        InspectorToolbarCenter: View,
        InspectorToolbarTrailing: View
    >(
        state: ThreeColumnState = ThreeColumnState(),
        icons: ThreeColumnButtonIcons = .init(),
        labels: ThreeColumnButtonLabels = .init(),
        @ViewBuilder Sidebar: @escaping () -> Sidebar,
        @ViewBuilder Detail: @escaping () -> Detail,
        @ViewBuilder sidebarToolbarCenter: @escaping (ThreeColumnViewState, ThreeColumnActions) -> SidebarToolbarCenter,
        @ViewBuilder sidebarToolbarTrailing: @escaping (ThreeColumnViewState, ThreeColumnActions) -> SidebarToolbarTrailing,
        @ViewBuilder detailToolbarLeading: @escaping (ThreeColumnViewState, ThreeColumnActions) -> DetailToolbarLeading,
        @ViewBuilder detailToolbarCenter: @escaping (ThreeColumnViewState, ThreeColumnActions) -> DetailToolbarCenter,
        @ViewBuilder detailToolbarTrailing: @escaping (ThreeColumnViewState, ThreeColumnActions) -> DetailToolbarTrailing,
        @ViewBuilder detailToolbarBottomLeading: @escaping (ThreeColumnViewState, ThreeColumnActions) -> DetailToolbarBottomLeading,
        @ViewBuilder detailToolbarBottomTrailing: @escaping (ThreeColumnViewState, ThreeColumnActions) -> DetailToolbarBottomTrailing,
        @ViewBuilder inspectorToolbarCenter: @escaping (ThreeColumnViewState, ThreeColumnActions) -> InspectorToolbarCenter,
        @ViewBuilder inspectorToolbarTrailing: @escaping (ThreeColumnViewState, ThreeColumnActions) -> InspectorToolbarTrailing
    ) {
        self.init(
            state: state,
            icons: icons,
            labels: labels,
            appliesDefaultChrome: true,
            sidebarToolbarCenter: { viewState, actions in
                AnyView(sidebarToolbarCenter(viewState, actions))
            },
            sidebarToolbarTrailing: { viewState, actions in
                AnyView(sidebarToolbarTrailing(viewState, actions))
            },
            detailToolbarLeading: { viewState, actions in
                AnyView(detailToolbarLeading(viewState, actions))
            },
            detailToolbarCenter: { viewState, actions in
                AnyView(detailToolbarCenter(viewState, actions))
            },
            detailToolbarTrailing: { viewState, actions in
                AnyView(detailToolbarTrailing(viewState, actions))
            },
            detailToolbarBottomLeading: { viewState, actions in
                AnyView(detailToolbarBottomLeading(viewState, actions))
            },
            detailToolbarBottomTrailing: { viewState, actions in
                AnyView(detailToolbarBottomTrailing(viewState, actions))
            }
        ) { _, _ in
            Sidebar()
        } detail: { _, _ in
            Detail()
        } inspector: { viewState, actions in
            DefaultInspectorView(
                viewState: viewState,
                actions: actions,
                centerToolbar: AnyView(inspectorToolbarCenter(viewState, actions)),
                trailingToolbar: AnyView(inspectorToolbarTrailing(viewState, actions))
            )
        }
    }

    init<
        SidebarToolbarCenter: View,
        SidebarToolbarTrailing: View,
        DetailToolbarLeading: View,
        DetailToolbarCenter: View,
        DetailToolbarTrailing: View,
        DetailToolbarBottom: View,
        InspectorToolbarCenter: View,
        InspectorToolbarTrailing: View
    >(
        state: ThreeColumnState = ThreeColumnState(),
        icons: ThreeColumnButtonIcons = .init(),
        labels: ThreeColumnButtonLabels = .init(),
        @ViewBuilder Sidebar: @escaping () -> Sidebar,
        @ViewBuilder Detail: @escaping () -> Detail,
        @ViewBuilder sidebarToolbarCenter: @escaping (ThreeColumnViewState, ThreeColumnActions) -> SidebarToolbarCenter,
        @ViewBuilder sidebarToolbarTrailing: @escaping (ThreeColumnViewState, ThreeColumnActions) -> SidebarToolbarTrailing,
        @ViewBuilder detailToolbarLeading: @escaping (ThreeColumnViewState, ThreeColumnActions) -> DetailToolbarLeading,
        @ViewBuilder detailToolbarCenter: @escaping (ThreeColumnViewState, ThreeColumnActions) -> DetailToolbarCenter,
        @ViewBuilder detailToolbarTrailing: @escaping (ThreeColumnViewState, ThreeColumnActions) -> DetailToolbarTrailing,
        @ViewBuilder detailToolbarBottom: @escaping (ThreeColumnViewState, ThreeColumnActions) -> DetailToolbarBottom,
        @ViewBuilder inspectorToolbarCenter: @escaping (ThreeColumnViewState, ThreeColumnActions) -> InspectorToolbarCenter,
        @ViewBuilder inspectorToolbarTrailing: @escaping (ThreeColumnViewState, ThreeColumnActions) -> InspectorToolbarTrailing
    ) {
        self.init(
            state: state,
            icons: icons,
            labels: labels,
            Sidebar: Sidebar,
            Detail: Detail,
            sidebarToolbarCenter: sidebarToolbarCenter,
            sidebarToolbarTrailing: sidebarToolbarTrailing,
            detailToolbarLeading: detailToolbarLeading,
            detailToolbarCenter: detailToolbarCenter,
            detailToolbarTrailing: detailToolbarTrailing,
            detailToolbarBottomLeading: detailToolbarBottom,
            detailToolbarBottomTrailing: { _, _ in
                EmptyView()
            },
            inspectorToolbarCenter: inspectorToolbarCenter,
            inspectorToolbarTrailing: inspectorToolbarTrailing
        )
    }

    init<SidebarToolbarCenter: View, SidebarToolbarTrailing: View>(
        state: ThreeColumnState = ThreeColumnState(),
        icons: ThreeColumnButtonIcons = .init(),
        labels: ThreeColumnButtonLabels = .init(),
        @ViewBuilder Sidebar: @escaping () -> Sidebar,
        @ViewBuilder Detail: @escaping () -> Detail,
        @ViewBuilder sidebarToolbarCenter: @escaping (ThreeColumnViewState, ThreeColumnActions) -> SidebarToolbarCenter,
        @ViewBuilder sidebarToolbarTrailing: @escaping (ThreeColumnViewState, ThreeColumnActions) -> SidebarToolbarTrailing
    ) {
        self.init(
            state: state,
            icons: icons,
            labels: labels,
            appliesDefaultChrome: true,
            sidebarToolbarCenter: { viewState, actions in
                AnyView(sidebarToolbarCenter(viewState, actions))
            },
            sidebarToolbarTrailing: { viewState, actions in
                AnyView(sidebarToolbarTrailing(viewState, actions))
            }
        ) { _, _ in
            Sidebar()
        } detail: { _, _ in
            Detail()
        } inspector: { viewState, actions in
            DefaultInspectorView(
                viewState: viewState,
                actions: actions,
                centerToolbar: nil,
                trailingToolbar: nil
            )
        }
    }
}

extension ThreePaneView where Inspector == DefaultInspectorView<EmptyView> {
    init(
        state: ThreeColumnState = ThreeColumnState(),
        icons: ThreeColumnButtonIcons = .init(),
        labels: ThreeColumnButtonLabels = .init(),
        @ViewBuilder Sidebar: @escaping () -> Sidebar,
        @ViewBuilder Detail: @escaping () -> Detail
    ) {
        self.init(state: state, icons: icons, labels: labels, appliesDefaultChrome: true) { _, _ in
            Sidebar()
        } detail: { _, _ in
            Detail()
        } inspector: { viewState, actions in
            DefaultInspectorView(
                viewState: viewState,
                actions: actions,
                centerToolbar: nil,
                trailingToolbar: nil
            )
        }
    }
}

private extension EnvironmentValues {
    var isCompactWidth: Bool {
        horizontalSizeClass == .compact
    }
}

private struct ThreeColumnNavigationTitlesKey: EnvironmentKey {
    static let defaultValue = ThreeColumnNavigationTitles()
}

extension EnvironmentValues {
    var threeColumnNavigationTitles: ThreeColumnNavigationTitles {
        get { self[ThreeColumnNavigationTitlesKey.self] }
        set { self[ThreeColumnNavigationTitlesKey.self] = newValue }
    }
}

extension View {
    func threeColumnNavigationTitles(_ titles: ThreeColumnNavigationTitles) -> some View {
        environment(\.threeColumnNavigationTitles, titles)
    }
}
