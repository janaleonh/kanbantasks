import Foundation
internal import ExpoModulesCore

final class PlannerFolderAccess: Module {
  private func failure(_ message: String) -> NSError {
    NSError(domain: "PlannerFolder", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
  }

  private func access<T>(_ bookmark: String, _ work: (URL) throws -> T) throws -> T {
    guard let data = Data(base64Encoded: bookmark) else { throw failure("Ordner erneut auswählen.") }
    var stale = false
    let root = try URL(resolvingBookmarkData: data, options: [.withoutUI], relativeTo: nil, bookmarkDataIsStale: &stale)
    guard !stale, root.startAccessingSecurityScopedResource() else { throw failure("Ordnerzugriff abgelaufen. Bitte erneut auswählen.") }
    defer { root.stopAccessingSecurityScopedResource() }
    return try work(root)
  }

  public func definition() -> ModuleDefinition {
    Name("PlannerFolderAccess")
    AsyncFunction("remember") { (uri: URL) -> String in
      guard uri.isFileURL else { throw self.failure("Ungültiger Ordner.") }
      return try uri.bookmarkData(options: .minimalBookmark, includingResourceValuesForKeys: nil, relativeTo: nil).base64EncodedString()
    }
    AsyncFunction("entries") { (bookmark: String) -> [[String: String]] in
      try self.access(bookmark) { root in
        let keys: [URLResourceKey] = [.isSymbolicLinkKey, .isRegularFileKey, .isDirectoryKey]
        var listingError: Error?
        guard let walker = FileManager.default.enumerator(at: root, includingPropertiesForKeys: keys, options: [.skipsHiddenFiles, .skipsPackageDescendants], errorHandler: { _, error in listingError = error; return false }) else { throw self.failure("Ordner nicht lesbar.") }
        var entries: [[String: String]] = []
        for case let url as URL in walker {
          let flags = try url.resourceValues(forKeys: Set(keys))
          if flags.isSymbolicLink == true { walker.skipDescendants(); continue }
          guard flags.isDirectory == true || flags.isRegularFile == true else { continue }
          let path = url.pathComponents.dropFirst(root.pathComponents.count).joined(separator: "/")
          entries.append(["path": path, "kind": flags.isDirectory == true ? "directory" : "file"])
          if entries.count > 5000 { throw self.failure("Bitte einen Ordner mit höchstens 5000 Einträgen wählen.") }
        }
        if let error = listingError { throw error }
        return entries
      }
    }
    AsyncFunction("snapshot") { (bookmark: String, path: String) -> String in
      try self.access(bookmark) { root in
        let source = root.appendingPathComponent(path).resolvingSymlinksInPath().standardizedFileURL
        guard source.path.hasPrefix(root.resolvingSymlinksInPath().standardizedFileURL.path + "/") else { throw self.failure("Ungültiger Dateipfad.") }
        let cache = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        let dest = cache.appendingPathComponent("PlannerFolder-" + UUID().uuidString)
        var coordinationError: NSError?
        var copyError: Error?
        NSFileCoordinator().coordinate(readingItemAt: source, options: [], error: &coordinationError) { url in
          do {
            let info = try url.resourceValues(forKeys: [.isRegularFileKey, .fileSizeKey])
            guard info.isRegularFile == true, let size = info.fileSize, size <= 50 * 1024 * 1024 else { throw self.failure("Datei zu groß oder nicht lesbar: " + path) }
            try FileManager.default.copyItem(at: url, to: dest)
          } catch { copyError = error }
        }
        if let problem = coordinationError ?? (copyError as NSError?) { try? FileManager.default.removeItem(at: dest); throw problem }
        return dest.absoluteString
      }
    }
  }
}
