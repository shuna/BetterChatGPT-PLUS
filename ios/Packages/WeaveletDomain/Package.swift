// swift-tools-version: 6.2

import PackageDescription

let package = Package(
    name: "WeaveletDomain",
    platforms: [
        .iOS(.v26),
        .macOS(.v26),
    ],
    products: [
        .library(name: "WeaveletDomain", targets: ["WeaveletDomain"]),
    ],
    dependencies: [
        // LZ-String will be added later for CloudKit sync compatibility
    ],
    targets: [
        .target(
            name: "WeaveletDomain",
            dependencies: []
        ),
        .testTarget(
            name: "WeaveletDomainTests",
            dependencies: ["WeaveletDomain"]
        ),
    ]
)
