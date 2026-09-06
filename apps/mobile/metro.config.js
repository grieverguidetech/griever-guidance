const { withNxMetro } = require('@nx/expo');
const { getDefaultConfig } = require('@expo/metro-config');
const { mergeConfig } = require('metro-config');

const defaultConfig = getDefaultConfig(__dirname);
const { assetExts, sourceExts } = defaultConfig.resolver;

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('metro-config').MetroConfig}
 */
const customConfig = {
  cacheVersion: 'mobile',
  transformer: {
    babelTransformerPath: require.resolve('react-native-svg-transformer'),
  },
  resolver: {
    assetExts: assetExts.filter((ext) => ext !== 'svg'),
    sourceExts: [...sourceExts, 'cjs', 'mjs', 'svg'],
  },
};

const nxMetroConfig = withNxMetro(mergeConfig(defaultConfig, customConfig), {
  // Change this to true to see debugging info.
  // Useful if you have issues resolving modules
  debug: false,
  // all the file extensions used for imports other than 'ts', 'tsx', 'js', 'jsx', 'json'
  extensions: [],
  // Specify folders to watch, in addition to Nx defaults (workspace libraries and node_modules)
  watchFolders: [],
});

// Every lib in this workspace is TypeScript authored with NodeNext-style ESM
// imports (e.g. `import x from './foo.js'` pointing at `foo.ts`) — Metro has
// no built-in support for that convention. `withNxMetro` installs its own
// `resolver.resolveRequest` (its whole point is workspace-aware resolution),
// so this has to wrap *that* function rather than set `resolveRequest` in
// `customConfig` above — `mergeConfig` can't merge two functions, so
// whichever is applied last wins outright, and `withNxMetro` is applied
// after `customConfig` here.
const nxResolveRequest = nxMetroConfig.resolver.resolveRequest;
nxMetroConfig.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith('.') && moduleName.endsWith('.js')) {
    const withoutExt = moduleName.slice(0, -'.js'.length);
    for (const ext of ['.ts', '.tsx']) {
      try {
        return nxResolveRequest(context, `${withoutExt}${ext}`, platform);
      } catch {
        // try the next extension
      }
    }
  }
  return nxResolveRequest(context, moduleName, platform);
};

module.exports = nxMetroConfig;
