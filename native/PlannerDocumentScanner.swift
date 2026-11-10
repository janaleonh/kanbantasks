import UIKit
import VisionKit
import Vision
import PDFKit
import AVFoundation
internal import ExpoModulesCore

final class PlannerDocumentScanner: Module {
  private var scannerDelegate: PlannerScanDelegate?

  public func definition() -> ModuleDefinition {
    Name("PlannerDocumentScanner")
    AsyncFunction("scan") { (promise: Promise) in
      guard self.scannerDelegate == nil else { promise.reject("SCAN_BUSY", "Eine Dokumentaufnahme läuft bereits."); return }
      guard VNDocumentCameraViewController.isSupported else { promise.reject("SCAN_UNAVAILABLE", "Die Dokumentkamera ist auf diesem Gerät nicht verfügbar."); return }
      let permission = AVCaptureDevice.authorizationStatus(for: .video)
      guard permission != .denied && permission != .restricted else { promise.reject("SCAN_PERMISSION", "Bitte erlaube Planner den Kamerazugriff in den iPhone-Einstellungen."); return }
      guard let controller = self.appContext?.utilities?.currentViewController(), let cache = self.appContext?.fileSystem?.cachesDirectory else { promise.reject("SCAN_UNAVAILABLE", "Die Dokumentkamera kann gerade nicht geöffnet werden."); return }
      let delegate = PlannerScanDelegate(directory: URL(fileURLWithPath: cache).appendingPathComponent("PlannerScans", isDirectory: true)) { [weak self] result, error in
        self?.scannerDelegate = nil
        if let error { promise.reject("SCAN_FAILED", error) } else { promise.resolve(result ?? ["canceled": true]) }
      }
      self.scannerDelegate = delegate
      let scanner = VNDocumentCameraViewController()
      scanner.delegate = delegate
      scanner.modalPresentationStyle = .fullScreen
      controller.present(scanner, animated: true)
    }.runOnQueue(.main)
  }
}

private final class PlannerScanDelegate: NSObject, VNDocumentCameraViewControllerDelegate {
  let directory: URL
  let finish: ([String: Any]?, String?) -> Void
  init(directory: URL, finish: @escaping ([String: Any]?, String?) -> Void) { self.directory = directory; self.finish = finish }

  func documentCameraViewControllerDidCancel(_ controller: VNDocumentCameraViewController) {
    controller.dismiss(animated: true) { self.finish(["canceled": true], nil) }
  }
  func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFailWithError error: Error) {
    controller.dismiss(animated: true) { self.finish(nil, "Die Aufnahme ist fehlgeschlagen. Bitte prüfe den Kamerazugriff und versuche es erneut.") }
  }
  func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFinishWith scan: VNDocumentCameraScan) {
    guard scan.pageCount > 0 && scan.pageCount <= 20 else {
      controller.dismiss(animated: true) { self.finish(nil, "Bitte scanne zwischen 1 und 20 Seiten pro Dokument.") }; return
    }
    let pageCount = scan.pageCount
    let complete: ([String: Any]?, String?) -> Void = { result, error in
      DispatchQueue.main.async { controller.dismiss(animated: true) { self.finish(result, error) } }
    }
    DispatchQueue.global(qos: .userInitiated).async {
      do {
        var content = ""
        let pdf = PDFDocument()
        for index in 0..<scan.pageCount {
          try autoreleasepool {
            let original = scan.imageOfPage(at: index)
            let ratio = min(1, 2400 / max(original.size.width, original.size.height))
            let size = CGSize(width: original.size.width * ratio, height: original.size.height * ratio)
            let format = UIGraphicsImageRendererFormat(); format.scale = 1; format.opaque = true
            let image = UIGraphicsImageRenderer(size: size, format: format).image { context in
              UIColor.white.setFill(); context.cgContext.fill(CGRect(origin: .zero, size: size)); original.draw(in: CGRect(origin: .zero, size: size))
            }
            guard let data = image.jpegData(compressionQuality: 0.85), let compressed = UIImage(data: data), let page = PDFPage(image: compressed) else { throw NSError(domain: "PlannerScan", code: 1) }
            pdf.insert(page, at: index)
            if content.count < 80000, let cg = image.cgImage {
              let request = VNRecognizeTextRequest()
              request.recognitionLevel = .accurate
              request.recognitionLanguages = ["de-DE", "en-US"]
              if (try? VNImageRequestHandler(cgImage: cg, options: [:]).perform([request])) != nil {
                let text = (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }.joined(separator: " ")
                content += " " + String(text.prefix(79999 - content.count))
              }
            }
          }
        }
        guard let data = pdf.dataRepresentation(), data.count <= 50 * 1024 * 1024 else {
          complete(nil, "Die PDF ist größer als 50 MB. Bitte verwende weniger Seiten."); return
        }
        try FileManager.default.createDirectory(at: self.directory, withIntermediateDirectories: true)
        let url = self.directory.appendingPathComponent(UUID().uuidString.lowercased() + ".pdf")
        try data.write(to: url, options: .atomic)
        complete(["canceled": false, "uri": url.absoluteString, "pages": pageCount, "content": content], nil)
      } catch {
        complete(nil, "Die PDF konnte nicht erstellt werden. Bitte prüfe den freien Speicher.")
      }
    }
  }
}
