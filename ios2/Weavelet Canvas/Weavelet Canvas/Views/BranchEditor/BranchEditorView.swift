import SwiftUI

struct BranchEditorView: View {
    var chatViewModel: ChatViewModel
    @State var viewModel: BranchEditorViewModel?
    @State private var canvasSize: CGSize = .zero
    @State private var dragStart: CGSize? = nil
    @State private var pinchStart: CGFloat? = nil
    @State private var pinchStartOffset: CGSize? = nil
    @State private var pinchAnchor: CGPoint? = nil

    private var vm: BranchEditorViewModel {
        viewModel ?? BranchEditorViewModel(chatViewModel: chatViewModel)
    }

    var body: some View {
        ZStack {
            if let viewModel = viewModel {
                branchCanvas(viewModel)
                    .contentShape(Rectangle())
                    .simultaneousGesture(panGesture)
                    .simultaneousGesture(pinchGesture)
                    .onTapGesture {
                        viewModel.selectedNodeIDs.removeAll()
                    }

                // Overlay controls
                VStack {
                    if viewModel.isSearching {
                        ChatFindBar(
                            query: Binding(
                                get: { viewModel.searchQuery },
                                set: { viewModel.searchQuery = $0 }
                            ),
                            currentMatch: viewModel.searchCurrentMatch,
                            totalMatches: viewModel.searchTotalMatches,
                            onPrevious: { viewModel.searchPrevious() },
                            onNext: { viewModel.searchNext() },
                            onClose: {
                                viewModel.isSearching = false
                                viewModel.searchQuery = ""
                            }
                        )
                        .padding(.top, 4)
                    }

                    Spacer()

                    HStack(alignment: .bottom) {
                        leftControls(viewModel)
                        Spacer()
                        MiniMapView(
                            viewModel: viewModel,
                            canvasSize: canvasSize,
                            onDrag: { newOffset in
                                viewModel.offset = newOffset
                            }
                        )
                    }
                    .padding(12)
                }
            } else {
                ProgressView()
            }
        }
        .background(Color(.systemGroupedBackground))
        .onAppear {
            if viewModel == nil {
                viewModel = BranchEditorViewModel(chatViewModel: chatViewModel)
            } else {
                viewModel?.rebuildFromDomain()
            }
        }
        .onChange(of: chatViewModel.messages) {
            viewModel?.rebuildFromDomain()
        }
        .onChange(of: chatViewModel.currentChatID) {
            viewModel?.rebuildFromDomain()
        }
        .onChange(of: chatViewModel.branchEditorSearchRequested) {
            viewModel?.isSearching.toggle()
        }
        .onGeometryChange(for: CGSize.self) { proxy in
            proxy.size
        } action: { newSize in
            canvasSize = newSize
            if canvasSize.width > 0 {
                viewModel?.fitToView(canvasSize: canvasSize)
            }
        }
        .sheet(item: Binding(
            get: { viewModel?.detailNode },
            set: { viewModel?.detailNode = $0 }
        )) { node in
            MessageDetailSheet(node: node)
        }
    }

    // MARK: - Canvas

    private func branchCanvas(_ viewModel: BranchEditorViewModel) -> some View {
        ZStack(alignment: .topLeading) {
            // Edges
            ForEach(viewModel.edges) { edge in
                if let source = viewModel.nodes.first(where: { $0.id == edge.sourceID }),
                   let target = viewModel.nodes.first(where: { $0.id == edge.targetID }) {

                    let nodeW = BranchEditorViewModel.nodeWidth
                    let nodeH = BranchEditorViewModel.nodeHeight
                    let fromX = source.position.x + nodeW / 2
                    let fromY = source.position.y + nodeH
                    let toX = target.position.x + nodeW / 2
                    let toY = target.position.y

                    Path { path in
                        path.move(to: CGPoint(x: fromX, y: fromY))
                        let midY = (fromY + toY) / 2
                        path.addCurve(
                            to: CGPoint(x: toX, y: toY),
                            control1: CGPoint(x: fromX, y: midY),
                            control2: CGPoint(x: toX, y: midY)
                        )
                    }
                    .stroke(
                        edge.isActive ? Color.accentColor : Color.gray.opacity(0.4),
                        lineWidth: (edge.isActive ? 2.5 : 1) / viewModel.zoom
                    )
                    .allowsHitTesting(false)
                }
            }

            // Nodes
            ForEach(viewModel.nodes) { node in
                BranchNodeView(
                    node: node,
                    isSelected: viewModel.selectedNodeIDs.contains(node.id),
                    isSearchMatch: viewModel.isSearchMatch(node.id),
                    isCurrentSearchMatch: viewModel.isCurrentSearchMatch(node.id),
                    zoom: viewModel.zoom,
                    onTap: { viewModel.selectNode(node.id) },
                    onDoubleTap: { viewModel.detailNode = node },
                    onToggleStar: { viewModel.toggleStarred(node.id) },
                    onTogglePin: { viewModel.togglePinned(node.id) },
                    onDelete: { viewModel.deleteNode(node.id) }
                )
                .position(
                    x: node.position.x + BranchEditorViewModel.nodeWidth / 2,
                    y: node.position.y + BranchEditorViewModel.nodeHeight / 2
                )
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .scaleEffect(viewModel.zoom, anchor: .topLeading)
        .offset(viewModel.offset)
    }

    // MARK: - Gestures

    private var panGesture: some Gesture {
        DragGesture()
            .onChanged { value in
                guard let viewModel else { return }
                if viewModel.interactionMode == .pan {
                    if dragStart == nil { dragStart = viewModel.offset }
                    viewModel.offset = CGSize(
                        width: dragStart!.width + value.translation.width,
                        height: dragStart!.height + value.translation.height
                    )
                }
            }
            .onEnded { _ in
                dragStart = nil
            }
    }

    private var pinchGesture: some Gesture {
        MagnifyGesture()
            .onChanged { value in
                guard let viewModel else { return }
                if pinchStart == nil {
                    pinchStart = viewModel.zoom
                    pinchStartOffset = viewModel.offset
                    pinchAnchor = CGPoint(x: canvasSize.width / 2, y: canvasSize.height / 2)
                }
                let newZoom = min(max(pinchStart! * value.magnification, BranchEditorViewModel.minZoom), BranchEditorViewModel.maxZoom)
                let ratio = newZoom / pinchStart!
                let anchor = pinchAnchor!
                viewModel.zoom = newZoom
                viewModel.offset = CGSize(
                    width: anchor.x - (anchor.x - pinchStartOffset!.width) * ratio,
                    height: anchor.y - (anchor.y - pinchStartOffset!.height) * ratio
                )
            }
            .onEnded { _ in
                pinchStart = nil
                pinchStartOffset = nil
                pinchAnchor = nil
            }
    }

    private func zoomCentered(by factor: CGFloat) {
        guard let viewModel else { return }
        let oldZoom = viewModel.zoom
        let newZoom = min(max(oldZoom * factor, BranchEditorViewModel.minZoom), BranchEditorViewModel.maxZoom)
        let cx = canvasSize.width / 2
        let cy = canvasSize.height / 2
        withAnimation(.easeInOut(duration: 0.2)) {
            viewModel.offset = CGSize(
                width: cx - (cx - viewModel.offset.width) * (newZoom / oldZoom),
                height: cy - (cy - viewModel.offset.height) * (newZoom / oldZoom)
            )
            viewModel.zoom = newZoom
        }
    }

    // MARK: - Left Controls

    private func leftControls(_ viewModel: BranchEditorViewModel) -> some View {
        VStack(spacing: 6) {
            controlGroup {
                controlButton(icon: BranchInteractionMode.pan.icon,
                              active: viewModel.interactionMode == .pan) {
                    viewModel.interactionMode = .pan
                }
                Divider().frame(width: 22)
                controlButton(icon: BranchInteractionMode.select.icon,
                              active: viewModel.interactionMode == .select) {
                    viewModel.interactionMode = .select
                }
            }

            controlGroup {
                controlButton(icon: "arrow.uturn.backward", disabled: !viewModel.canUndo) { viewModel.undo() }
                Divider().frame(width: 22)
                controlButton(icon: "arrow.uturn.forward", disabled: !viewModel.canRedo) { viewModel.redo() }
            }

            controlGroup {
                controlButton(icon: "plus") { zoomCentered(by: 1.3) }
                Divider().frame(width: 22)
                controlButton(icon: "minus") { zoomCentered(by: 1 / 1.3) }
                Divider().frame(width: 22)
                controlButton(icon: "arrow.up.left.and.down.right.and.arrow.up.right.and.down.left") {
                    withAnimation(.easeInOut(duration: 0.3)) {
                        viewModel.fitToView(canvasSize: canvasSize)
                    }
                }
            }
        }
    }

    // MARK: - Control Helpers

    private func controlGroup<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        VStack(spacing: 0) {
            content()
        }
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 10))
    }

    private func controlButton(icon: String, active: Bool = false, disabled: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 14, weight: .medium))
                .frame(width: 36, height: 32)
                .foregroundStyle(active ? AnyShapeStyle(.white) : (disabled ? AnyShapeStyle(.tertiary) : AnyShapeStyle(.primary)))
                .background(active ? Color.accentColor : Color.clear)
        }
        .disabled(disabled)
    }
}

// MARK: - Branch Node View

private struct BranchNodeView: View {
    let node: UIBranchNode
    let isSelected: Bool
    var isSearchMatch: Bool = false
    var isCurrentSearchMatch: Bool = false
    let zoom: CGFloat
    let onTap: () -> Void
    let onDoubleTap: () -> Void
    let onToggleStar: () -> Void
    let onTogglePin: () -> Void
    let onDelete: () -> Void

    private var roleColor: Color {
        switch node.role {
        case .user: .blue
        case .assistant: .green
        case .system: .purple
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 5) {
                Text(node.role.label)
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(roleColor, in: Capsule())
                    .lineLimit(1)
                    .fixedSize()

                if let label = node.label {
                    Text(label)
                        .font(.system(size: 10))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }

                Spacer(minLength: 2)

                if node.isPinned {
                    Image(systemName: "pin.fill")
                        .font(.system(size: 8))
                        .foregroundStyle(.blue)
                }
                if node.isStarred {
                    Image(systemName: "star.fill")
                        .font(.system(size: 8))
                        .foregroundStyle(.yellow)
                }
            }

            Text(node.contentPreview)
                .font(.system(size: 12))
                .foregroundStyle(node.isActive ? .primary : .secondary)
                .lineLimit(3)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(10)
        .frame(width: BranchEditorViewModel.nodeWidth, height: BranchEditorViewModel.nodeHeight, alignment: .topLeading)
        .clipped()
        .background {
            RoundedRectangle(cornerRadius: 10)
                .fill(node.isActive ? Color(.systemBackground) : Color(.secondarySystemBackground))
                .shadow(color: .black.opacity(0.08), radius: 3, y: 2)
        }
        .overlay {
            RoundedRectangle(cornerRadius: 10)
                .stroke(
                    isCurrentSearchMatch ? Color.yellow :
                    isSearchMatch ? Color.orange.opacity(0.7) :
                    isSelected ? Color.accentColor :
                    node.isActive ? roleColor.opacity(0.3) :
                    Color(.separator).opacity(0.2),
                    lineWidth: isCurrentSearchMatch ? 3 : isSearchMatch ? 2 : isSelected ? 2.5 : 1
                )
        }
        .opacity(node.isActive ? 1 : 0.55)
        .onTapGesture(count: 2) { onDoubleTap() }
        .onTapGesture { onTap() }
        .contextMenu {
            if let label = node.label {
                Button { } label: { Label("Edit Label: \(label)", systemImage: "pencil") }
            } else {
                Button { } label: { Label("Add Label", systemImage: "tag") }
            }

            Button { onToggleStar() } label: {
                Label(node.isStarred ? "Unstar" : "Star", systemImage: node.isStarred ? "star.slash" : "star")
            }
            Button { onTogglePin() } label: {
                Label(node.isPinned ? "Unpin" : "Pin", systemImage: node.isPinned ? "pin.slash" : "pin")
            }

            Divider()

            Button { } label: { Label("Copy Messages", systemImage: "doc.on.doc") }
            Button { } label: { Label("Navigate to Message", systemImage: "arrow.right.circle") }
            Button { } label: { Label("Compare Branches", systemImage: "arrow.left.arrow.right") }

            Divider()

            Button(role: .destructive) { onDelete() } label: {
                Label("Delete Branch", systemImage: "trash")
            }
        }
    }
}

// MARK: - MiniMap

private struct MiniMapView: View {
    var viewModel: BranchEditorViewModel
    var canvasSize: CGSize
    var onDrag: (CGSize) -> Void

    @State private var miniDragStart: CGSize? = nil

    private var graphBounds: (minX: CGFloat, maxX: CGFloat, minY: CGFloat, maxY: CGFloat, scale: CGFloat) {
        guard !viewModel.nodes.isEmpty else { return (0, 1, 0, 1, 1) }
        let minX = viewModel.nodes.map(\.position.x).min()! - 20
        let maxX = viewModel.nodes.map(\.position.x).max()! + BranchEditorViewModel.nodeWidth + 20
        let minY = viewModel.nodes.map(\.position.y).min()! - 20
        let maxY = viewModel.nodes.map(\.position.y).max()! + BranchEditorViewModel.nodeHeight + 20
        let graphW = maxX - minX
        let graphH = maxY - minY
        let scale = min(140 / graphW, 100 / graphH)
        return (minX, maxX, minY, maxY, scale)
    }

    var body: some View {
        let bounds = graphBounds

        Canvas { context, size in
            guard !viewModel.nodes.isEmpty else { return }
            let s = bounds.scale

            for node in viewModel.nodes {
                let x = (node.position.x - bounds.minX) * s
                let y = (node.position.y - bounds.minY) * s
                let w = BranchEditorViewModel.nodeWidth * s
                let h = BranchEditorViewModel.nodeHeight * s * 0.15
                let rect = CGRect(x: x, y: y, width: w, height: h)
                context.fill(Path(roundedRect: rect, cornerRadius: 1), with: .color(node.isActive ? .accentColor : .gray))
            }

            if canvasSize.width > 0 {
                let vpX = (-viewModel.offset.width / viewModel.zoom - bounds.minX) * s
                let vpY = (-viewModel.offset.height / viewModel.zoom - bounds.minY) * s
                let vpW = (canvasSize.width / viewModel.zoom) * s
                let vpH = (canvasSize.height / viewModel.zoom) * s
                let vpRect = CGRect(x: vpX, y: vpY, width: vpW, height: vpH)
                context.fill(Path(roundedRect: vpRect, cornerRadius: 2), with: .color(.accentColor.opacity(0.12)))
                context.stroke(Path(roundedRect: vpRect, cornerRadius: 2), with: .color(.accentColor.opacity(0.6)), lineWidth: 1.5)
            }
        }
        .frame(width: 140, height: 100)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 8))
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(Color(.separator).opacity(0.3), lineWidth: 0.5)
        )
        .gesture(
            DragGesture()
                .onChanged { value in
                    if miniDragStart == nil { miniDragStart = viewModel.offset }
                    let s = bounds.scale
                    let dx = value.translation.width / s * viewModel.zoom
                    let dy = value.translation.height / s * viewModel.zoom
                    onDrag(CGSize(
                        width: miniDragStart!.width - dx,
                        height: miniDragStart!.height - dy
                    ))
                }
                .onEnded { _ in
                    miniDragStart = nil
                }
        )
    }
}

// MARK: - Message Detail Sheet

private struct MessageDetailSheet: View {
    let node: UIBranchNode
    @Environment(\.dismiss) private var dismiss

    private var roleColor: Color {
        switch node.role {
        case .user: .blue
        case .assistant: .green
        case .system: .purple
        }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    HStack(spacing: 8) {
                        Text(node.role.label)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 4)
                            .background(roleColor, in: Capsule())

                        if let label = node.label {
                            Text(label)
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }

                        Spacer()

                        if node.isStarred {
                            Image(systemName: "star.fill").foregroundStyle(.yellow)
                        }
                        if node.isPinned {
                            Image(systemName: "pin.fill").foregroundStyle(.blue)
                        }
                    }

                    Divider()

                    Text(node.content)
                        .font(.body)
                        .textSelection(.enabled)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .padding()
            }
            .navigationTitle("Message Detail")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                        .fontWeight(.semibold)
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}
