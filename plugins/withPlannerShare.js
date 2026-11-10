const fs = require('fs');
const path = require('path');
const { withFinalizedMod } = require('expo/config-plugins');
const plist = require('@expo/plist').default;

function configureShareTarget(dir) {
  const infoPath = path.join(dir, 'Info.plist');
  const info = plist.parse(fs.readFileSync(infoPath, 'utf8'));
  info.MainTargetUrlScheme = 'kanban-tasks';
  info.CFBundleDisplayName = 'Planner';
  fs.writeFileSync(infoPath, plist.build(info));
  const file = path.join(dir, 'ShareIntoViewController.swift');
  let swift = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const original = 'let destinationURL = containerURL.appendingPathComponent(fileName)';
  if (swift.split(original).length !== 3) throw new Error('Expo sharing template changed. Check incoming file locations.');
  swift = swift.replaceAll(original, `let folder = containerURL.appendingPathComponent("PlannerIncoming", isDirectory: true).appendingPathComponent(UUID().uuidString, isDirectory: true)
    guard (try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)) != nil else { return nil }
    let destinationURL = folder.appendingPathComponent((fileName as NSString).lastPathComponent)`);
  swift = swift.replace('    return nil\n  }\n\n  // MARK: - Handlers', `    if provider.hasItemConformingToTypeIdentifier(UTType.data.identifier) {
      return await handleFile(provider, type: .file, utType: .data)
    }
    return nil
  }

  // MARK: - Handlers`).replace('://expo-sharing"', '://expo-sharing?delivery=\\(UUID().uuidString)"');
  const start = swift.indexOf('  private func saveToUserDefaults');
  const end = swift.indexOf('  // MARK: - Provider Parsing', start);
  if (start < 0 || end < 0) throw new Error('Unexpected share extension template.');
  swift = swift.slice(0,start) + `  private let deliveryID = UUID().uuidString
  private var processing = false

  private func persist(_ payload: [SharePayload]) -> Bool {
    guard let root = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupId),
          let data = try? JSONEncoder().encode(payload) else { return false }
    let receipt = root.appendingPathComponent("PlannerShare-" + deliveryID + ".json")
    return (try? data.write(to: receipt, options: [.atomic, .completeFileProtection])) != nil
  }

` + swift.slice(end);
  swift = swift.replace('if !payload.isEmpty {\n        saveToUserDefaults(payload)', 'if !payload.isEmpty && persist(payload) {')
    .replace('guard let items = extensionContext', 'guard !processing else { return }; processing = true\n    guard let items = extensionContext')
    .replace('delivery=\\(UUID().uuidString)', 'delivery=\\(deliveryID)');
  fs.writeFileSync(file, swift);
}

module.exports = config => withFinalizedMod(config, ['ios', async mod => {
  configureShareTarget(path.join(mod.modRequest.platformProjectRoot, 'expo-sharing-extension'));
  return mod;
}]);
module.exports.configureShareTarget = configureShareTarget;
