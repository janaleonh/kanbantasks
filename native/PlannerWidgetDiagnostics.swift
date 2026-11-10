import WidgetKit
internal import ExpoModulesCore

final class PlannerWidgetDiagnostics: Module {
  public func definition() -> ModuleDefinition {
    Name("PlannerWidgetDiagnostics")
    AsyncFunction("installedKinds") { (promise: Promise) in
      WidgetCenter.shared.getCurrentConfigurations { result in
        switch result {
        case .success(let widgets):
          promise.resolve(widgets.map { $0.kind })
        case .failure:
          promise.reject("WIDGET_QUERY", "iOS konnte die Widget-Konfiguration nicht lesen.")
        }
      }
    }
  }
}
