// Ad-hoc sign the macOS app so it launches on Apple Silicon without a Developer ID.
const { execSync } = require('child_process');
const path = require('path');
exports.default = async function (context) {
  if (context.electronPlatformName !== 'darwin') return;
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  try {
    execSync(`codesign --force --deep --sign - "${app}"`, { stdio: 'inherit' });
    console.log('Ad-hoc signed', app);
  } catch (e) { console.warn('Ad-hoc signing failed:', e.message); }
};
