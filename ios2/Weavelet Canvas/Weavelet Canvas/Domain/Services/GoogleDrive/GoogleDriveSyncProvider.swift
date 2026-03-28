import Foundation
import os

/// Google Drive sync provider using REST API with appDataFolder.
///
/// File management:
/// - Single file `weavelet-canvas-sync.wvlt` in appDataFolder
/// - fileId cached after first lookup
/// - Multiple files: adopt newest, log warning (no auto-delete in v1)
actor GoogleDriveSyncProvider: CloudSyncProvider {

    nonisolated let providerType: CloudSyncProviderType = .googleDrive

    private let fileName = "weavelet-canvas-sync.wvlt"
    private let logger = Logger(subsystem: "org.sstcr.WeaveletCanvas", category: "GoogleDrive")

    /// Cached file ID for the sync file. Persisted to UserDefaults.
    private var cachedFileId: String? {
        didSet { persistFileId() }
    }

    init() {
        self.cachedFileId = UserDefaults.standard.string(forKey: "googledrive.fileId")
    }

    // MARK: - CloudSyncProvider

    nonisolated func checkAuth() async -> Bool {
        guard let tokens = GoogleOAuthService.loadTokens() else { return false }
        // Consider authenticated if we have tokens (even if expired — refresh will handle it)
        return !tokens.accessToken.isEmpty
    }

    func authenticate() async throws {
        let tokens = try await GoogleOAuthService.authenticate()
        GoogleOAuthService.saveTokens(tokens)
    }

    func disconnect() async {
        cachedFileId = nil
        UserDefaults.standard.removeObject(forKey: "googledrive.fileId")
        GoogleOAuthService.clearTokens()
    }

    func readSnapshot() async throws -> Data? {
        guard let fileId = try await resolveFileId() else {
            return nil
        }

        let url = URL(string: "https://www.googleapis.com/drive/v3/files/\(fileId)?alt=media")!
        let (data, _) = try await authenticatedRequest(url: url, method: "GET")
        return data
    }

    func writeSnapshot(_ data: Data) async throws {
        if let fileId = try await resolveFileId() {
            // Update existing file
            try await updateFile(fileId: fileId, data: data)
        } else {
            // Create new file
            let newFileId = try await createFile(data: data)
            cachedFileId = newFileId
        }
    }

    func deleteSnapshot() async throws {
        guard let fileId = try await resolveFileId() else { return }

        let url = URL(string: "https://www.googleapis.com/drive/v3/files/\(fileId)")!
        let _ = try await authenticatedRequest(url: url, method: "DELETE")
        cachedFileId = nil
    }

    // MARK: - File Resolution

    /// Find the sync file in appDataFolder. Caches fileId after first lookup.
    private func resolveFileId() async throws -> String? {
        if let cached = cachedFileId {
            return cached
        }

        let query = "name='\(fileName)' and trashed=false"
        let encodedQuery = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? query
        let url = URL(string: "https://www.googleapis.com/drive/v3/files?q=\(encodedQuery)&spaces=appDataFolder&fields=files(id,modifiedTime)&orderBy=modifiedTime desc")!

        let (data, _) = try await authenticatedRequest(url: url, method: "GET")

        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let files = json["files"] as? [[String: Any]] else {
            return nil
        }

        if files.isEmpty {
            return nil
        }

        if files.count > 1 {
            logger.warning("Multiple sync files found (\(files.count)). Using most recent.")
        }

        // Adopt the most recent (already sorted by modifiedTime desc)
        guard let fileId = files.first?["id"] as? String else { return nil }
        cachedFileId = fileId
        return fileId
    }

    // MARK: - File Operations

    private func createFile(data: Data) async throws -> String {
        // Multipart upload: metadata + content
        let boundary = UUID().uuidString
        let metadata: [String: Any] = [
            "name": fileName,
            "parents": ["appDataFolder"],
        ]
        let metadataData = try JSONSerialization.data(withJSONObject: metadata)

        var body = Data()
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Type: application/json; charset=UTF-8\r\n\r\n".data(using: .utf8)!)
        body.append(metadataData)
        body.append("\r\n--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Type: application/octet-stream\r\n\r\n".data(using: .utf8)!)
        body.append(data)
        body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)

        let url = URL(string: "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("multipart/related; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.httpBody = body

        let (responseData, _) = try await authenticatedDataRequest(request)

        guard let json = try? JSONSerialization.jsonObject(with: responseData) as? [String: Any],
              let fileId = json["id"] as? String else {
            throw GoogleDriveError.createFailed
        }

        return fileId
    }

    private func updateFile(fileId: String, data: Data) async throws {
        let url = URL(string: "https://www.googleapis.com/upload/drive/v3/files/\(fileId)?uploadType=media")!
        var request = URLRequest(url: url)
        request.httpMethod = "PATCH"
        request.setValue("application/octet-stream", forHTTPHeaderField: "Content-Type")
        request.httpBody = data

        let _ = try await authenticatedDataRequest(request)
    }

    // MARK: - Authenticated Requests

    /// Simple GET/DELETE request with auth.
    private func authenticatedRequest(url: URL, method: String) async throws -> (Data, URLResponse) {
        var request = URLRequest(url: url)
        request.httpMethod = method
        return try await authenticatedDataRequest(request)
    }

    /// Execute a request with token refresh on 401. Rejects non-2xx responses.
    private func authenticatedDataRequest(_ request: URLRequest) async throws -> (Data, URLResponse) {
        let tokens = GoogleOAuthService.loadTokens()
        guard var currentTokens = tokens else {
            throw GoogleDriveError.notAuthenticated
        }

        // Refresh if expired
        if currentTokens.expiresAt < Date() {
            currentTokens = try await GoogleOAuthService.refresh(refreshToken: currentTokens.refreshToken)
            GoogleOAuthService.saveTokens(currentTokens)
        }

        var authedRequest = request
        authedRequest.setValue("Bearer \(currentTokens.accessToken)", forHTTPHeaderField: "Authorization")

        let (data, response) = try await URLSession.shared.data(for: authedRequest)

        // Retry once on 401
        if let http = response as? HTTPURLResponse, http.statusCode == 401 {
            logger.info("Got 401, attempting token refresh")
            let refreshed = try await GoogleOAuthService.refresh(refreshToken: currentTokens.refreshToken)
            GoogleOAuthService.saveTokens(refreshed)

            var retryRequest = request
            retryRequest.setValue("Bearer \(refreshed.accessToken)", forHTTPHeaderField: "Authorization")
            let (retryData, retryResponse) = try await URLSession.shared.data(for: retryRequest)
            try validateHTTPResponse(retryResponse, data: retryData)
            return (retryData, retryResponse)
        }

        try validateHTTPResponse(response, data: data)
        return (data, response)
    }

    /// Reject non-2xx HTTP responses with a typed error.
    private func validateHTTPResponse(_ response: URLResponse, data: Data) throws {
        guard let http = response as? HTTPURLResponse else { return }
        guard (200...299).contains(http.statusCode) else {
            if http.statusCode == 404 {
                cachedFileId = nil
                throw GoogleDriveError.fileNotFound
            }
            let body = String(data: data, encoding: .utf8) ?? ""
            throw GoogleDriveError.httpError(statusCode: http.statusCode, body: body)
        }
    }

    // MARK: - Helpers

    private func persistFileId() {
        if let id = cachedFileId {
            UserDefaults.standard.set(id, forKey: "googledrive.fileId")
        } else {
            UserDefaults.standard.removeObject(forKey: "googledrive.fileId")
        }
    }
}

// MARK: - Errors

enum GoogleDriveError: Error, LocalizedError {
    case notAuthenticated
    case fileNotFound
    case createFailed
    case uploadFailed(String)
    case httpError(statusCode: Int, body: String)

    var errorDescription: String? {
        switch self {
        case .notAuthenticated: "Google Drive: not authenticated"
        case .fileNotFound: "Google Drive: sync file not found"
        case .createFailed: "Google Drive: failed to create sync file"
        case .uploadFailed(let msg): "Google Drive: upload failed: \(msg)"
        case .httpError(let code, let body): "Google Drive: HTTP \(code): \(body.prefix(200))"
        }
    }
}
