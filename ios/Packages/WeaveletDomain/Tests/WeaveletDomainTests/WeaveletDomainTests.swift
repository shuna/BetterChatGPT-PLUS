import Testing
@testable import WeaveletDomain

@Test func versionExists() {
    #expect(!WeaveletDomain.version.isEmpty)
}
