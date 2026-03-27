import Testing
import Foundation
@testable import Weavelet_Canvas

@Suite("GoogleOAuthService")
struct GoogleOAuthServiceTests {

    @Test("PKCE code verifier is correct length")
    func codeVerifierLength() {
        let verifier = GoogleOAuthService.generateCodeVerifier()
        // Base64URL of 32 bytes = 43 chars (no padding)
        #expect(verifier.count == 43)
    }

    @Test("PKCE code verifier uses URL-safe characters only")
    func codeVerifierChars() {
        let verifier = GoogleOAuthService.generateCodeVerifier()
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-._~"))
        for char in verifier.unicodeScalars {
            #expect(allowed.contains(char), "Unexpected character: \(char)")
        }
    }

    @Test("PKCE code verifier is random (two calls differ)")
    func codeVerifierRandom() {
        let v1 = GoogleOAuthService.generateCodeVerifier()
        let v2 = GoogleOAuthService.generateCodeVerifier()
        #expect(v1 != v2)
    }

    @Test("PKCE code challenge is Base64URL encoded SHA256")
    func codeChallenge() {
        let verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
        let challenge = GoogleOAuthService.codeChallenge(from: verifier)

        // Known S256 of this verifier from RFC 7636 test vector
        // SHA256("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk") = E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM
        #expect(challenge == "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM")
    }

    @Test("Code challenge is URL-safe (no +, /, =)")
    func codeChallengeUrlSafe() {
        for _ in 0..<10 {
            let verifier = GoogleOAuthService.generateCodeVerifier()
            let challenge = GoogleOAuthService.codeChallenge(from: verifier)
            #expect(!challenge.contains("+"))
            #expect(!challenge.contains("/"))
            #expect(!challenge.contains("="))
        }
    }
}
