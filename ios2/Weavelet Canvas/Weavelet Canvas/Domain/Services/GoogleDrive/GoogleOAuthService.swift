import AuthenticationServices
import CryptoKit
import Foundation
import os

// MARK: - Token Model

struct GoogleTokens {
    let accessToken: String
    let refreshToken: String
    let expiresAt: Date
}

// MARK: - OAuth Service

/// Google OAuth2 PKCE flow using ASWebAuthenticationSession.
/// Scope: drive.appdata (hidden app-specific folder).
nonisolated enum GoogleOAuthService {

    private static let logger = Logger(subsystem: "org.sstcr.WeaveletCanvas", category: "GoogleOAuth")

    // OAuth endpoints
    private static let authEndpoint = "https://accounts.google.com/o/oauth2/v2/auth"
    private static let tokenEndpoint = "https://oauth2.googleapis.com/token"
    private static let scope = "https://www.googleapis.com/auth/drive.appdata"
    private static let redirectScheme = "com.sstcr.weaveletcanvas"
    private static let redirectURI = "\(redirectScheme):/oauth2callback"

    // Keychain keys
    private static let accessTokenKey = "google.accessToken"
    private static let refreshTokenKey = "google.refreshToken"
    private static let expiresAtKey = "google.expiresAt"

    /// Get the Google Client ID from build settings / environment.
    static var clientId: String {
        // TODO: Inject from build settings or Info.plist
        Bundle.main.object(forInfoDictionaryKey: "GOOGLE_CLIENT_ID") as? String ?? ""
    }

    // MARK: - PKCE

    /// Generate a cryptographically random code verifier (43-128 chars, [A-Za-z0-9-._~]).
    static func generateCodeVerifier() -> String {
        var bytes = [UInt8](repeating: 0, count: 32)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        return Data(bytes)
            .base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    /// Compute S256 code challenge from verifier.
    static func codeChallenge(from verifier: String) -> String {
        let data = Data(verifier.utf8)
        let hash = SHA256.hash(data: data)
        return Data(hash)
            .base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    // MARK: - Auth Flow

    /// Start the OAuth2 PKCE flow.
    /// Presents a web authentication session to the user.
    @MainActor
    static func authenticate() async throws -> GoogleTokens {
        guard !clientId.isEmpty else {
            throw GoogleOAuthError.noClientId
        }

        let verifier = generateCodeVerifier()
        let challenge = codeChallenge(from: verifier)

        var components = URLComponents(string: authEndpoint)!
        components.queryItems = [
            URLQueryItem(name: "client_id", value: clientId),
            URLQueryItem(name: "redirect_uri", value: redirectURI),
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "scope", value: scope),
            URLQueryItem(name: "code_challenge", value: challenge),
            URLQueryItem(name: "code_challenge_method", value: "S256"),
            URLQueryItem(name: "access_type", value: "offline"),
            URLQueryItem(name: "prompt", value: "consent"),
        ]

        let authURL = components.url!

        let callbackURL = try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<URL, Error>) in
            let session = ASWebAuthenticationSession(
                url: authURL,
                callbackURLScheme: redirectScheme
            ) { url, error in
                if let error {
                    continuation.resume(throwing: error)
                } else if let url {
                    continuation.resume(returning: url)
                } else {
                    continuation.resume(throwing: GoogleOAuthError.cancelled)
                }
            }
            session.prefersEphemeralWebBrowserSession = false
            session.start()
        }

        // Extract authorization code
        guard let components = URLComponents(url: callbackURL, resolvingAgainstBaseURL: false),
              let code = components.queryItems?.first(where: { $0.name == "code" })?.value else {
            throw GoogleOAuthError.noAuthCode
        }

        // Exchange code for tokens
        return try await exchangeCodeForTokens(code: code, codeVerifier: verifier)
    }

    // MARK: - Token Exchange

    private static func exchangeCodeForTokens(code: String, codeVerifier: String) async throws -> GoogleTokens {
        var request = URLRequest(url: URL(string: tokenEndpoint)!)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")

        let params = [
            "client_id": clientId,
            "code": code,
            "code_verifier": codeVerifier,
            "grant_type": "authorization_code",
            "redirect_uri": redirectURI,
        ]
        request.httpBody = params.map { "\($0.key)=\($0.value.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? $0.value)" }
            .joined(separator: "&")
            .data(using: .utf8)

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            let body = String(data: data, encoding: .utf8) ?? ""
            throw GoogleOAuthError.tokenExchangeFailed(body)
        }

        return try parseTokenResponse(data)
    }

    // MARK: - Token Refresh

    /// Refresh an expired access token using the refresh token.
    static func refresh(refreshToken: String) async throws -> GoogleTokens {
        var request = URLRequest(url: URL(string: tokenEndpoint)!)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")

        let params = [
            "client_id": clientId,
            "refresh_token": refreshToken,
            "grant_type": "refresh_token",
        ]
        request.httpBody = params.map { "\($0.key)=\($0.value.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? $0.value)" }
            .joined(separator: "&")
            .data(using: .utf8)

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            let body = String(data: data, encoding: .utf8) ?? ""
            throw GoogleOAuthError.tokenRefreshFailed(body)
        }

        // Refresh response may not include refresh_token — preserve existing
        let parsed = try parseTokenResponse(data)
        return GoogleTokens(
            accessToken: parsed.accessToken,
            refreshToken: parsed.refreshToken.isEmpty ? refreshToken : parsed.refreshToken,
            expiresAt: parsed.expiresAt
        )
    }

    // MARK: - Token Persistence

    static func saveTokens(_ tokens: GoogleTokens) {
        KeychainHelper.save(key: accessTokenKey, value: tokens.accessToken)
        KeychainHelper.save(key: refreshTokenKey, value: tokens.refreshToken)
        UserDefaults.standard.set(tokens.expiresAt.timeIntervalSince1970, forKey: expiresAtKey)
    }

    static func loadTokens() -> GoogleTokens? {
        guard let access = KeychainHelper.load(key: accessTokenKey),
              let refresh = KeychainHelper.load(key: refreshTokenKey) else { return nil }
        let expiresAt = Date(timeIntervalSince1970: UserDefaults.standard.double(forKey: expiresAtKey))
        return GoogleTokens(accessToken: access, refreshToken: refresh, expiresAt: expiresAt)
    }

    static func clearTokens() {
        KeychainHelper.delete(key: accessTokenKey)
        KeychainHelper.delete(key: refreshTokenKey)
        UserDefaults.standard.removeObject(forKey: expiresAtKey)
    }

    // MARK: - Helpers

    private static func parseTokenResponse(_ data: Data) throws -> GoogleTokens {
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let accessToken = json["access_token"] as? String else {
            throw GoogleOAuthError.invalidTokenResponse
        }

        let refreshToken = json["refresh_token"] as? String ?? ""
        let expiresIn = json["expires_in"] as? Int ?? 3600
        let expiresAt = Date().addingTimeInterval(TimeInterval(expiresIn))

        return GoogleTokens(
            accessToken: accessToken,
            refreshToken: refreshToken,
            expiresAt: expiresAt
        )
    }
}

// MARK: - Errors

enum GoogleOAuthError: Error, LocalizedError {
    case cancelled
    case noAuthCode
    case tokenExchangeFailed(String)
    case tokenRefreshFailed(String)
    case invalidTokenResponse
    case noClientId

    var errorDescription: String? {
        switch self {
        case .cancelled: "Authentication cancelled"
        case .noAuthCode: "No authorization code received"
        case .tokenExchangeFailed(let body): "Token exchange failed: \(body)"
        case .tokenRefreshFailed(let body): "Token refresh failed: \(body)"
        case .invalidTokenResponse: "Invalid token response"
        case .noClientId: "Google Client ID not configured"
        }
    }
}
