const { exec } = require('child_process');
const path = require('path');

const rebuild = async () => {
  try {
    const electronVersion = process.env.npm_config_target ||
      process.versions.electron ||
      require('electron/package.json')?.version ||
      '13.6.9';

    console.log('Rebuilding for Electron version:', electronVersion);

    const rebuildCmd = [
      'npm rebuild',
      '@serialport/bindings-cpp',
      `--runtime=electron`,
      `--target=${electronVersion}`,
      '--disturl=https://electronjs.org/headers',
      '--build-from-source=false',
      '--abi=' + process.versions.modules
    ].join(' ');

    exec(rebuildCmd, (error, stdout, stderr) => {
      console.log(stdout);
      if (stderr) console.error(stderr);

      if (error) {
        console.error('Rebuild failed:', error);
        process.exit(1);
      }

      try {
        const bindings = require('@serialport/bindings-cpp');
        console.log('✅ Bindings successfully loaded');
        console.log('Native module path:', require.resolve('@serialport/bindings-cpp'));
      } catch (err) {
        console.error('❌ Bindings load failed:', err);
        process.exit(1);
      }
      console.log('check node-gyp-build...');
      try {
        const gypBuildPath = require.resolve('node-gyp-build');
        console.log('🛠️ node-gyp-build path:', gypBuildPath);
      } catch (e) {
        console.error('❌ not found node-gyp-build:', e.message);
      }
    });
  } catch (err) {
    console.error('Setup error:', err);
    process.exit(1);
  }
};

rebuild();