import SwiftUI

/// A draggable resize handle between two panels.
/// Used for sidebar width adjustment and split-view panel ratio on iPad.
struct ResizableHandle: View {
    /// The axis of the resize (horizontal = drag left/right, vertical = drag up/down).
    let axis: Axis

    /// Current offset from center (bind to a width/height state).
    @Binding var offset: CGFloat

    /// Min/max bounds for the offset.
    let range: ClosedRange<CGFloat>

    @State private var isDragging = false

    var body: some View {
        Group {
            if axis == .horizontal {
                horizontalHandle
            } else {
                verticalHandle
            }
        }
        .contentShape(Rectangle())
        .gesture(dragGesture)
    }

    @ViewBuilder
    private var horizontalHandle: some View {
        Rectangle()
            .fill(Color(.separator).opacity(isDragging ? 0.8 : 0.4))
            .frame(width: isDragging ? 4 : 2)
            .overlay {
                // Grip dots
                VStack(spacing: 3) {
                    ForEach(0..<3, id: \.self) { _ in
                        Circle()
                            .fill(Color(.tertiaryLabel))
                            .frame(width: 4, height: 4)
                    }
                }
            }
            .frame(width: 12) // Hit target
            .background(Color.clear) // Extend tap area
    }

    @ViewBuilder
    private var verticalHandle: some View {
        Rectangle()
            .fill(Color(.separator).opacity(isDragging ? 0.8 : 0.4))
            .frame(height: isDragging ? 4 : 2)
            .overlay {
                // Grip dots
                HStack(spacing: 3) {
                    ForEach(0..<3, id: \.self) { _ in
                        Circle()
                            .fill(Color(.tertiaryLabel))
                            .frame(width: 4, height: 4)
                    }
                }
            }
            .frame(height: 12) // Hit target
            .background(Color.clear)
    }

    private var dragGesture: some Gesture {
        DragGesture(minimumDistance: 1)
            .onChanged { value in
                isDragging = true
                let delta = axis == .horizontal ? value.translation.width : value.translation.height
                let newOffset = offset + delta
                offset = min(max(newOffset, range.lowerBound), range.upperBound)
            }
            .onEnded { _ in
                isDragging = false
            }
    }
}

// MARK: - Resizable Split Container

/// A two-panel container with a draggable divider.
struct ResizableSplitView<Leading: View, Trailing: View>: View {
    let axis: Axis
    @Binding var ratio: CGFloat  // 0.0 to 1.0
    let minRatio: CGFloat
    let maxRatio: CGFloat
    @ViewBuilder let leading: () -> Leading
    @ViewBuilder let trailing: () -> Trailing

    init(
        axis: Axis = .horizontal,
        ratio: Binding<CGFloat>,
        minRatio: CGFloat = 0.2,
        maxRatio: CGFloat = 0.8,
        @ViewBuilder leading: @escaping () -> Leading,
        @ViewBuilder trailing: @escaping () -> Trailing
    ) {
        self.axis = axis
        self._ratio = ratio
        self.minRatio = minRatio
        self.maxRatio = maxRatio
        self.leading = leading
        self.trailing = trailing
    }

    var body: some View {
        GeometryReader { geo in
            let totalSize = axis == .horizontal ? geo.size.width : geo.size.height
            let leadingSize = totalSize * ratio
            let trailingSize = totalSize - leadingSize - 12 // handle width

            if axis == .horizontal {
                HStack(spacing: 0) {
                    leading()
                        .frame(width: leadingSize)
                    ResizableHandle(
                        axis: .horizontal,
                        offset: Binding(
                            get: { leadingSize },
                            set: { newWidth in
                                ratio = min(max(newWidth / totalSize, minRatio), maxRatio)
                            }
                        ),
                        range: (totalSize * minRatio)...(totalSize * maxRatio)
                    )
                    trailing()
                        .frame(width: trailingSize)
                }
            } else {
                VStack(spacing: 0) {
                    leading()
                        .frame(height: leadingSize)
                    ResizableHandle(
                        axis: .vertical,
                        offset: Binding(
                            get: { leadingSize },
                            set: { newHeight in
                                ratio = min(max(newHeight / totalSize, minRatio), maxRatio)
                            }
                        ),
                        range: (totalSize * minRatio)...(totalSize * maxRatio)
                    )
                    trailing()
                        .frame(height: trailingSize)
                }
            }
        }
    }
}
