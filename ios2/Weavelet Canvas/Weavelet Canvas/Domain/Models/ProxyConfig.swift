import Foundation

/// Configuration for the Weavelet Stream Proxy worker.
struct ProxyConfig {
    /// Base URL of the proxy worker (trailing slash stripped, whitespace trimmed).
    let endpoint: String
    /// Optional Bearer token for proxy authentication.
    let authToken: String?
}
