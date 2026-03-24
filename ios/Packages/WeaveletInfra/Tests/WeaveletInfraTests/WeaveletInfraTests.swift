import Testing
@testable import WeaveletInfra

@Test func infraDependsOnDomain() {
    #expect(!WeaveletInfra.version.isEmpty)
}
