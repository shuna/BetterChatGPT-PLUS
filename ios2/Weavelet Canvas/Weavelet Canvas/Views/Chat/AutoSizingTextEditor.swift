import SwiftUI
import UIKit

struct AutoSizingTextEditor: UIViewRepresentable {
    @Binding var text: String
    @Binding var calculatedHeight: CGFloat
    @Binding var isFocused: Bool

    var placeholder: String = ""
    var enterToSubmit: Bool = false
    var minVisibleLines: Int = 1
    var maxVisibleLines: Int = 3
    var onSubmit: (() -> Void)? = nil

    func makeCoordinator() -> Coordinator {
        Coordinator(parent: self)
    }

    func makeUIView(context: Context) -> UITextView {
        let textView = UITextView()
        textView.delegate = context.coordinator
        textView.font = UIFont.preferredFont(forTextStyle: .body)
        textView.backgroundColor = .clear
        textView.textContainerInset = UIEdgeInsets(top: 8, left: 8, bottom: 8, right: 8)
        textView.textContainer.lineFragmentPadding = 0
        textView.isScrollEnabled = false
        textView.showsVerticalScrollIndicator = true
        textView.showsHorizontalScrollIndicator = false
        textView.keyboardDismissMode = .interactive
        textView.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        textView.adjustsFontForContentSizeCategory = true
        context.coordinator.applyText(to: textView)
        DispatchQueue.main.async {
            recalculateHeight(for: textView)
        }
        return textView
    }

    func updateUIView(_ textView: UITextView, context: Context) {
        context.coordinator.parent = self
        if textView.text != text {
            context.coordinator.applyText(to: textView)
        } else {
            context.coordinator.updatePlaceholderState(for: textView)
        }
        if isFocused, !textView.isFirstResponder {
            textView.becomeFirstResponder()
        } else if !isFocused, textView.isFirstResponder {
            textView.resignFirstResponder()
        }
        recalculateHeight(for: textView)
    }

    private func recalculateHeight(for textView: UITextView) {
        let minHeight = height(forVisibleLines: minVisibleLines, textView: textView)
        let maxHeight = height(forVisibleLines: maxVisibleLines, textView: textView)
        let fittingSize = CGSize(width: textView.bounds.width > 0 ? textView.bounds.width : (textView.window?.windowScene?.screen.bounds.width ?? 375), height: .greatestFiniteMagnitude)
        let measuredHeight = textView.sizeThatFits(fittingSize).height
        let clampedHeight = min(max(measuredHeight, minHeight), maxHeight)
        let shouldScroll = measuredHeight > maxHeight + 0.5

        if abs(calculatedHeight - clampedHeight) > 0.5 {
            DispatchQueue.main.async {
                calculatedHeight = clampedHeight
            }
        }

        if textView.isScrollEnabled != shouldScroll {
            textView.isScrollEnabled = shouldScroll
            textView.flashScrollIndicators()
        }
    }

    private func height(forVisibleLines lines: Int, textView: UITextView) -> CGFloat {
        let font = textView.font ?? UIFont.preferredFont(forTextStyle: .body)
        let inset = textView.textContainerInset.top + textView.textContainerInset.bottom
        return ceil(font.lineHeight * CGFloat(lines) + inset)
    }

    final class Coordinator: NSObject, UITextViewDelegate {
        var parent: AutoSizingTextEditor

        init(parent: AutoSizingTextEditor) {
            self.parent = parent
        }

        func textViewDidChange(_ textView: UITextView) {
            parent.text = textView.textColor == .placeholderText ? "" : textView.text
            updatePlaceholderState(for: textView)
            parent.recalculateHeight(for: textView)
        }

        func textView(
            _ textView: UITextView,
            shouldChangeTextIn range: NSRange,
            replacementText replacement: String
        ) -> Bool {
            if replacement == "\n", parent.enterToSubmit, parent.maxVisibleLines <= 1 {
                parent.onSubmit?()
                return false
            }
            return true
        }

        func textViewDidBeginEditing(_ textView: UITextView) {
            parent.isFocused = true
            if textView.textColor == .placeholderText {
                textView.text = nil
                textView.textColor = .label
            }
        }

        func textViewDidEndEditing(_ textView: UITextView) {
            parent.isFocused = false
            updatePlaceholderState(for: textView)
        }

        func updatePlaceholderState(for textView: UITextView) {
            if parent.text.isEmpty, !textView.isFirstResponder {
                textView.text = parent.placeholder
                textView.textColor = .placeholderText
            } else if textView.textColor == .placeholderText {
                textView.text = parent.text
                textView.textColor = .label
            }
        }

        func applyText(to textView: UITextView) {
            if parent.text.isEmpty, !textView.isFirstResponder {
                textView.text = parent.placeholder
                textView.textColor = .placeholderText
            } else {
                textView.text = parent.text
                textView.textColor = .label
            }
        }
    }
}
