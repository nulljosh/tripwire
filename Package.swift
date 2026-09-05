// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "tripwire-tui",
    platforms: [.macOS(.v13)],
    dependencies: [
        .package(url: "https://github.com/rensbreur/SwiftTUI", branch: "main")
    ],
    targets: [
        .executableTarget(
            name: "tripwire-tui",
            dependencies: ["SwiftTUI"],
            path: "tui"
        )
    ]
)
