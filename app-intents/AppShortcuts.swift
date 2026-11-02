import AppIntents

struct AppShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(intent: CreatePlannerTaskIntent(), phrases: [
      "Aufgabe in \(.applicationName) hinzufügen",
      "Neue Aufgabe in \(.applicationName)"
    ], shortTitle: "Aufgabe hinzufügen", systemImageName: "plus.circle")
  }
}
