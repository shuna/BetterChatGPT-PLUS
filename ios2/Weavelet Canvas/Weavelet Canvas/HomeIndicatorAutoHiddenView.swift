import SwiftUI

final class HomeIndicatorHostingController<Content: View>: UIHostingController<Content> {
    override var prefersHomeIndicatorAutoHidden: Bool { true }

    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { .bottom }
}

struct HomeIndicatorAutoHiddenView<Content: View>: UIViewControllerRepresentable {
    let content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    func makeUIViewController(context: Context) -> HomeIndicatorHostingController<Content> {
        HomeIndicatorHostingController(rootView: content)
    }

    func updateUIViewController(_ uiViewController: HomeIndicatorHostingController<Content>, context: Context) {
        uiViewController.rootView = content
        uiViewController.setNeedsUpdateOfHomeIndicatorAutoHidden()
        uiViewController.setNeedsUpdateOfScreenEdgesDeferringSystemGestures()
    }
}
