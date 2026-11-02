import AppIntents
internal import ExpoAppIntents

struct CreatePlannerTaskIntent: AppIntent {
  static let title: LocalizedStringResource = "Aufgabe in Planner hinzufügen"
  static let openAppWhenRun: Bool = true
  static let authenticationPolicy: IntentAuthenticationPolicy = .requiresLocalDeviceAuthentication

  @Parameter(title: "Aufgabentitel")
  var taskTitle: String

  @MainActor
  func perform() async throws -> some IntentResult & ProvidesDialog {
    await AppIntentDispatcher.shared.dispatch(name: "createPlannerTask", params: ["title": .string(taskTitle)])
    return .result(dialog: "Öffne Planner, um die Aufgabe zu übernehmen.")
  }
}
