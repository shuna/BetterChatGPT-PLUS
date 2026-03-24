// swift-tools-version: 6.2

import PackageDescription

let package = Package(
    name: "WeaveletInfra",
    platforms: [
        .iOS(.v26),
        .macOS(.v26),
    ],
    products: [
        .library(name: "WeaveletInfra", targets: ["WeaveletInfra"]),
    ],
    dependencies: [
        .package(path: "../WeaveletDomain"),
    ],
    targets: [
        .target(
            name: "WeaveletInfra",
            dependencies: [
                .product(name: "WeaveletDomain", package: "WeaveletDomain"),
            ]
        ),
        .testTarget(
            name: "WeaveletInfraTests",
            dependencies: ["WeaveletInfra"]
        ),
    ]
)
