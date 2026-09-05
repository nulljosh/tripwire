import Foundation
import SwiftTUI

// ponytail: fetches the live /api status the dashboard reads, renders it as a
// terminal watch list. Same static-render shape as the rest of the fleet's TUIs.

struct WatchReport: Decodable, Identifiable { var id: String { name }; let name: String; let status: String }
struct Last: Decodable { let at: String; let report: [WatchReport] }
struct Status: Decodable { let last: Last }

func fetchStatus() async -> Status? {
    guard let url = URL(string: "https://tripwire.heyitsmejosh.com/api") else { return nil }
    guard let (data, _) = try? await URLSession.shared.data(from: url) else { return nil }
    return try? JSONDecoder().decode(Status.self, from: data)
}

struct StatusCard: View {
    let status: Status?

    var body: some View {
        VStack(alignment: .leading) {
            Text("tripwire").bold()
            if let status {
                Text("last checked \(status.last.at)")
                ForEach(status.last.report) { r in
                    Text("\(r.status == "unchanged" ? "ok" : "!!") \(r.name): \(r.status)")
                }
            } else {
                Text("Could not reach tripwire.heyitsmejosh.com")
            }
        }
        .padding()
        .border()
    }
}

let semaphore = DispatchSemaphore(value: 0)
var status: Status?
Task {
    status = await fetchStatus()
    semaphore.signal()
}
semaphore.wait()

Application(rootView: StatusCard(status: status)).start()
