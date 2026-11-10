const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const plist = require('@expo/plist').default;
const {configureShareTarget} = require('../plugins/withPlannerShare');

test('the installed iOS share template generates an isolated delivery with a valid Planner return URL', t => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'planner-share-test-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const filename='ShareIntoViewController.swift';
  const packageDir=path.dirname(require.resolve('expo-sharing/package.json'));
  fs.copyFileSync(path.join(packageDir,'plugin/template-files/ios',filename),path.join(dir,filename));
  fs.writeFileSync(path.join(dir,'Info.plist'),plist.build({MainTargetUrlScheme:['kanban-tasks','oauth']}));
  configureShareTarget(dir);
  const swift=fs.readFileSync(path.join(dir,filename),'utf8');
  assert.ok(swift.includes('if !payload.isEmpty && persist(payload)'));
  assert.ok(swift.includes('://expo-sharing?delivery=\\(deliveryID)'));
  assert.ok(!swift.includes('saveToUserDefaults('));
  assert.equal(swift.split('appendingPathComponent("PlannerIncoming"').length,3);
  assert.ok(swift.includes('return await handleFile(provider, type: .file, utType: .data)'));
  assert.equal(plist.parse(fs.readFileSync(path.join(dir,'Info.plist'),'utf8')).MainTargetUrlScheme,'kanban-tasks');
});
