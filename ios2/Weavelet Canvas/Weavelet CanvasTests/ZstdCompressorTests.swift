import Testing
import Foundation
@testable import Weavelet_Canvas

@Suite("ZstdCompressor")
struct ZstdCompressorTests {

    @Test("Compress/decompress roundtrip")
    func roundtrip() throws {
        let original = "Hello, zstd compression! 🎉".data(using: .utf8)!
        let compressed = try ZstdCompressor.compress(original)
        let decompressed = try ZstdCompressor.decompress(compressed, uncompressedSize: original.count)
        #expect(decompressed == original)
    }

    @Test("Empty data roundtrip")
    func emptyData() throws {
        let compressed = try ZstdCompressor.compress(Data())
        #expect(compressed.isEmpty)
        let decompressed = try ZstdCompressor.decompress(Data(), uncompressedSize: 0)
        #expect(decompressed.isEmpty)
    }

    @Test("Large data roundtrip")
    func largeData() throws {
        // 100KB of repeated JSON-like content
        let chunk = "{\"key\":\"value\",\"number\":42,\"nested\":{\"a\":1}}".data(using: .utf8)!
        var large = Data()
        for _ in 0..<2500 {
            large.append(chunk)
        }
        #expect(large.count > 100_000)

        let compressed = try ZstdCompressor.compress(large)
        // zstd should compress repeated content well
        #expect(compressed.count < large.count)

        let decompressed = try ZstdCompressor.decompress(compressed, uncompressedSize: large.count)
        #expect(decompressed == large)
    }

    @Test("Different compression levels produce valid output")
    func compressionLevels() throws {
        let data = String(repeating: "abcdefgh", count: 1000).data(using: .utf8)!

        for level: Int32 in [1, 3, 9, 19] {
            let compressed = try ZstdCompressor.compress(data, level: level)
            let decompressed = try ZstdCompressor.decompress(compressed, uncompressedSize: data.count)
            #expect(decompressed == data)
        }
    }

    @Test("Decompress with wrong size throws")
    func wrongSize() throws {
        let data = "test data".data(using: .utf8)!
        let compressed = try ZstdCompressor.compress(data)

        #expect(throws: ZstdError.self) {
            try ZstdCompressor.decompress(compressed, uncompressedSize: data.count + 100)
        }
    }
}
