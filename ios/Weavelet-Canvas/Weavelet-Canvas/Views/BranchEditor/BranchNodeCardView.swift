import SwiftUI
import WeaveletDomain

/// A card representing a single branch node in the tree editor.
/// Matches Web version's MessageNode (240×72 pt).
struct BranchNodeCardView: View {
    let node: BranchNode
    let contentPreview: String
    let isOnActivePath: Bool
    let isSelected: Bool
    let isSearchMatch: Bool
    let isCompareTarget: Bool
    let onTap: () -> Void
    let onDoubleTap: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            // Header: role badge + label + star/pin
            HStack(spacing: 4) {
                roleBadge
                if let label = node.label, !label.isEmpty {
                    Text(label)
                        .font(.caption2)
                        .fontWeight(.semibold)
                        .lineLimit(1)
                }
                Spacer(minLength: 0)
                if node.pinned == true {
                    Image(systemName: "pin.fill")
                        .font(.system(size: 8))
                        .foregroundStyle(.red)
                }
                if node.starred == true {
                    Image(systemName: "star.fill")
                        .font(.system(size: 8))
                        .foregroundStyle(.yellow)
                }
            }

            // Content preview
            Text(contentPreview.isEmpty ? " " : contentPreview)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .lineLimit(2)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .frame(width: TreeLayoutEngine.nodeWidth, height: TreeLayoutEngine.nodeHeight)
        .background(nodeBackground, in: RoundedRectangle(cornerRadius: 8))
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .strokeBorder(borderColor, lineWidth: isSelected ? 2.5 : (isOnActivePath ? 1.5 : 0.5))
        )
        .overlay(
            // Search match ring (yellow)
            isSearchMatch ?
                RoundedRectangle(cornerRadius: 10)
                    .strokeBorder(Color.yellow, lineWidth: 3)
                    .padding(-2)
            : nil
        )
        .overlay(
            // Compare target ring (purple)
            isCompareTarget ?
                RoundedRectangle(cornerRadius: 10)
                    .strokeBorder(Color.purple, lineWidth: 3)
                    .padding(-2)
            : nil
        )
        .opacity(isOnActivePath ? 1.0 : 0.55)
        .contentShape(Rectangle())
        .onTapGesture(count: 2) { onDoubleTap() }
        .onTapGesture(count: 1) { onTap() }
    }

    // MARK: - Styling

    private var roleColor: Color {
        switch node.role {
        case .user: .blue
        case .assistant: .green
        case .system: .purple
        }
    }

    @ViewBuilder
    private var roleBadge: some View {
        Text(node.role.rawValue.prefix(1).uppercased())
            .font(.system(size: 9, weight: .bold, design: .rounded))
            .foregroundStyle(.white)
            .frame(width: 16, height: 16)
            .background(roleColor, in: Circle())
    }

    private var borderColor: Color {
        if isSelected { return .accentColor }
        if isOnActivePath { return roleColor }
        return Color(.separator)
    }

    private var nodeBackground: some ShapeStyle {
        Color(.secondarySystemGroupedBackground)
    }
}
