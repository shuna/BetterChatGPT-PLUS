import SwiftUI

struct MessageActionBar: View {
    let message: ChatMessage
    let onCopy: () -> Void
    let onDelete: () -> Void
    let onRegenerate: () -> Void
    let onMoveUp: () -> Void
    let onMoveDown: () -> Void
    let onEdit: () -> Void
    let isFirst: Bool
    let isLast: Bool

    @State private var showDeleteConfirmation = false

    var body: some View {
        HStack(spacing: 0) {
            // Regenerate
            actionButton("arrow.clockwise", label: "Regenerate") { onRegenerate() }

            Divider().frame(height: 20)

            // Move Up / Down
            actionButton("arrow.up", label: "Move Up", disabled: isFirst) { onMoveUp() }
            actionButton("arrow.down", label: "Move Down", disabled: isLast) { onMoveDown() }

            Divider().frame(height: 20)

            // Copy
            actionButton("doc.on.doc", label: "Copy") { onCopy() }

            // Edit
            actionButton("pencil", label: "Edit") { onEdit() }

            // Delete
            actionButton("trash", label: "Delete", isDestructive: true) {
                showDeleteConfirmation = true
            }
        }
        .glassEffect(.regular.interactive())
        .clipShape(Capsule())
        .frame(height: 44)
        .confirmationDialog("Delete this message?", isPresented: $showDeleteConfirmation, titleVisibility: .visible) {
            Button("Delete", role: .destructive) { onDelete() }
        }
    }

    // Simple action button
    private func actionButton(
        _ icon: String,
        label: String,
        isDestructive: Bool = false,
        disabled: Bool = false,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(
                    disabled ? Color(.quaternaryLabel) :
                    isDestructive ? Color.red.opacity(0.8) : .primary
                )
                .frame(width: 38, height: 36)
        }
        .disabled(disabled)
        .accessibilityLabel(label)
    }

}
