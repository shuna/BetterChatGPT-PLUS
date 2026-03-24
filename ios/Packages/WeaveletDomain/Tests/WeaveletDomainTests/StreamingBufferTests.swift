import Testing
import Foundation
@testable import WeaveletDomain

@Test func initializeAndAppendText() {
    let buffer = StreamingBuffer()
    buffer.initializeBuffer(nodeId: "n1", chatId: "c1")

    buffer.appendText(nodeId: "n1", text: "Hello")
    buffer.appendText(nodeId: "n1", text: " World")

    let content = buffer.peekBufferedContent("n1")
    #expect(content?.count == 1)
    #expect(content?[0].textValue == "Hello World")
}

@Test func appendReasoningSeparately() {
    let buffer = StreamingBuffer()
    buffer.initializeBuffer(nodeId: "n1", chatId: "c1")

    buffer.appendReasoning(nodeId: "n1", text: "Think...")
    buffer.appendText(nodeId: "n1", text: "Answer")

    #expect(buffer.peekBufferedReasoning("n1") == "Think...")
    #expect(buffer.peekBufferedContent("n1")?[0].textValue == "Answer")
}

@Test func finalizePrependsReasoning() {
    let buffer = StreamingBuffer()
    buffer.initializeBuffer(nodeId: "n1", chatId: "c1")

    buffer.appendReasoning(nodeId: "n1", text: "Let me think")
    buffer.appendText(nodeId: "n1", text: "The answer is 42")

    let finalized = buffer.finalizeBuffer(nodeId: "n1")
    #expect(finalized?.count == 2)
    #expect(finalized?[0].isReasoning == true)
    #expect(finalized?[1].textValue == "The answer is 42")

    // Buffer cleared after finalize
    #expect(!buffer.isBufferingNode("n1"))
}

@Test func finalizeWithoutReasoning() {
    let buffer = StreamingBuffer()
    buffer.initializeBuffer(nodeId: "n1", chatId: "c1")
    buffer.appendText(nodeId: "n1", text: "Just text")

    let finalized = buffer.finalizeBuffer(nodeId: "n1")
    #expect(finalized?.count == 1)
    #expect(finalized?[0].textValue == "Just text")
}

@Test func hasActiveBuffers() {
    let buffer = StreamingBuffer()
    #expect(!buffer.hasActiveBuffers)

    buffer.initializeBuffer(nodeId: "n1", chatId: "c1")
    #expect(buffer.hasActiveBuffers)

    _ = buffer.finalizeBuffer(nodeId: "n1")
    #expect(!buffer.hasActiveBuffers)
}

@Test func streamingChatIds() {
    let buffer = StreamingBuffer()
    buffer.initializeBuffer(nodeId: "n1", chatId: "c1")
    buffer.initializeBuffer(nodeId: "n2", chatId: "c1")
    buffer.initializeBuffer(nodeId: "n3", chatId: "c2")

    let chatIds = buffer.streamingChatIds
    #expect(chatIds.count == 2)
    #expect(chatIds.contains("c1"))
    #expect(chatIds.contains("c2"))
}

@Test func isBufferingNode() {
    let buffer = StreamingBuffer()
    #expect(!buffer.isBufferingNode("n1"))

    buffer.initializeBuffer(nodeId: "n1", chatId: "c1")
    #expect(buffer.isBufferingNode("n1"))
    #expect(!buffer.isBufferingNode("n2"))
}

@Test func clearRemovesAllBuffers() {
    let buffer = StreamingBuffer()
    buffer.initializeBuffer(nodeId: "n1", chatId: "c1")
    buffer.initializeBuffer(nodeId: "n2", chatId: "c2")
    buffer.appendText(nodeId: "n1", text: "data")

    buffer.clear()
    #expect(!buffer.hasActiveBuffers)
    #expect(buffer.streamingChatIds.isEmpty)
}

@Test func appendToNonexistentBufferIsNoop() {
    let buffer = StreamingBuffer()
    buffer.appendText(nodeId: "nonexistent", text: "hello")
    buffer.appendReasoning(nodeId: "nonexistent", text: "think")
    #expect(buffer.peekBufferedContent("nonexistent") == nil)
}

@Test func finalizeNonexistentBufferReturnsNil() {
    let buffer = StreamingBuffer()
    let result = buffer.finalizeBuffer(nodeId: "nonexistent")
    #expect(result == nil)
}
