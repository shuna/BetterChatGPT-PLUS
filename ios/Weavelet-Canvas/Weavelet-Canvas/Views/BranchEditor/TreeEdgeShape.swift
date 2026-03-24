import SwiftUI
import WeaveletDomain

/// Draws edges (parent → child connections) for the branch tree.
struct TreeEdgesView: View {
    let layout: TreeLayoutResult
    let activePathSet: Set<String>

    private let nodeW = TreeLayoutEngine.nodeWidth
    private let nodeH = TreeLayoutEngine.nodeHeight

    var body: some View {
        Canvas { context, _ in
            for (_, nodeLayout) in layout.nodes {
                guard let parentId = nodeLayout.parentId,
                      let parentLayout = layout.nodes[parentId] else { continue }

                let bothActive = activePathSet.contains(nodeLayout.id) &&
                                 activePathSet.contains(parentId)

                // Start: bottom center of parent
                let startX = parentLayout.x + nodeW / 2
                let startY = parentLayout.y + nodeH

                // End: top center of child
                let endX = nodeLayout.x + nodeW / 2
                let endY = nodeLayout.y

                // Bezier curve
                let midY = (startY + endY) / 2
                var path = Path()
                path.move(to: CGPoint(x: startX, y: startY))
                path.addCurve(
                    to: CGPoint(x: endX, y: endY),
                    control1: CGPoint(x: startX, y: midY),
                    control2: CGPoint(x: endX, y: midY)
                )

                context.stroke(
                    path,
                    with: .color(bothActive ? .accentColor : Color(.separator)),
                    lineWidth: bothActive ? 2 : 1
                )
            }
        }
        .allowsHitTesting(false)
    }
}
