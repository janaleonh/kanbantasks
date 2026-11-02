const { withFinalizedMod, IOSConfig } = require('expo/config-plugins');
const { generateImageAsync } = require('@expo/image-utils');
const fs = require('node:fs');
const path = require('node:path');

const SLOTS = [
  ['iphone', 20, 2], ['iphone', 20, 3], ['iphone', 29, 2], ['iphone', 29, 3],
  ['iphone', 40, 2], ['iphone', 40, 3], ['iphone', 60, 2], ['iphone', 60, 3],
  ['ipad', 20, 1], ['ipad', 20, 2], ['ipad', 29, 1], ['ipad', 29, 2],
  ['ipad', 40, 1], ['ipad', 40, 2], ['ipad', 76, 1], ['ipad', 76, 2], ['ipad', 83.5, 2],
];

async function addNotificationIcons(projectRoot, catalog, icon) {
  const contentsPath = path.join(catalog, 'Contents.json');
  const contents = JSON.parse(fs.readFileSync(contentsPath, 'utf8'));
  const images = contents.images || [];
  for (const [idiom, points, scale] of SLOTS) {
    const size = `${points}x${points}`;
    const filename = `Planner-${idiom}-${points}@${scale}x.png`;
    const { source } = await generateImageAsync({ projectRoot, cacheType: 'planner-notification-icons' }, {
      src: path.resolve(projectRoot, icon), name: filename, width: Math.round(points * scale), height: Math.round(points * scale),
      resizeMode: 'cover', removeTransparency: true, backgroundColor: '#FFFFFF',
    });
    fs.writeFileSync(path.join(catalog, filename), source);
    const existing = images.findIndex(image => image.idiom === idiom && image.size === size && image.scale === `${scale}x` && !image.appearances);
    const entry = { idiom, size, scale: `${scale}x`, filename };
    if (existing < 0) images.push(entry); else images[existing] = entry;
  }
  fs.writeFileSync(contentsPath, JSON.stringify({ ...contents, images }, null, 2) + '\n');
}

module.exports = config => withFinalizedMod(config, ['ios', async mod => {
  const icon = typeof mod.ios?.icon === 'string' ? mod.ios.icon : mod.ios?.icon?.light || mod.icon;
  if (!icon || path.extname(icon).toLowerCase() !== '.png') return mod;
  const root = mod.modRequest.projectRoot;
  const catalog = path.join(IOSConfig.Paths.getSourceRoot(root), 'Images.xcassets', 'AppIcon.appiconset');
  if (!fs.existsSync(path.join(catalog, 'Contents.json'))) throw new Error('Planner AppIcon catalog missing; cannot generate notification icon sizes.');
  await addNotificationIcons(root, catalog, icon);
  return mod;
}]);
module.exports.addNotificationIcons = addNotificationIcons;
