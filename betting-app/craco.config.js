// craco.config.js
const path = require("path");
require("dotenv").config();

const isDevServer = process.env.NODE_ENV !== "production";

const config = {
  enableHealthCheck: false,
  enableVisualEdits: false,
};

let setupDevServer;
let babelMetadataPlugin;

if (config.enableVisualEdits) {
  setupDevServer = require("./plugins/visual-edits/dev-server-setup");
  babelMetadataPlugin = require("./plugins/visual-edits/babel-metadata-plugin");
}

let WebpackHealthPlugin;
let setupHealthEndpoints;
let healthPluginInstance;

if (config.enableHealthCheck) {
  WebpackHealthPlugin = require("./plugins/health-check/webpack-health-plugin");
  setupHealthEndpoints = require("./plugins/health-check/health-endpoints");
  healthPluginInstance = new WebpackHealthPlugin();
}

// Helper to recursively find and patch postcss-loader
const patchPostcssLoader = (rules) => {
  if (!rules) return;

  rules.forEach(rule => {
    if (rule.oneOf) {
      patchPostcssLoader(rule.oneOf);
    }

    if (rule.use && Array.isArray(rule.use)) {
      rule.use.forEach(loader => {
        if (typeof loader === 'object' && loader.loader && loader.loader.includes('postcss-loader')) {
          // Ensure options structure exists
          if (!loader.options) loader.options = {};
          if (!loader.options.postcssOptions) loader.options.postcssOptions = {};

          // Replace plugins array completely with tailwindcss configured with our config file
          loader.options.postcssOptions.plugins = [
            [require('tailwindcss'), { config: path.resolve(__dirname, 'tailwind.config.js') }],
            require('autoprefixer'),
          ];

          // Remove config: false so postcss will look for config
          delete loader.options.postcssOptions.config;
        }
      });
    }

    if (rule.rules) {
      patchPostcssLoader(rule.rules);
    }
  });
};

module.exports = {
  eslint: {
    configure: {
      extends: ["plugin:react-hooks/recommended"],
      rules: {
        "react-hooks/rules-of-hooks": "error",
        "react-hooks/exhaustive-deps": "warn",
      },
    },
  },
  webpack: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
    configure: (webpackConfig, { env, paths }) => {
      // Patch postcss-loader in webpack config
      patchPostcssLoader(webpackConfig.module.rules);

      webpackConfig.watchOptions = {
        ...webpackConfig.watchOptions,
        ignored: [
          '**/node_modules/**',
          '**/.git/**',
          '**/build/**',
          '**/dist/**',
          '**/coverage/**',
          '**/public/**',
        ],
      };

      if (config.enableHealthCheck && healthPluginInstance) {
        webpackConfig.plugins.push(healthPluginInstance);
      }

      return webpackConfig;
    },
  },
  babel: config.enableVisualEdits && babelMetadataPlugin ? {
    plugins: [babelMetadataPlugin],
  } : undefined,
  devServer: (devServerConfig) => {
    if (config.enableVisualEdits && setupDevServer) {
      devServerConfig = setupDevServer(devServerConfig);
    }

    if (config.enableHealthCheck && setupHealthEndpoints && healthPluginInstance) {
      const originalSetupMiddlewares = devServerConfig.setupMiddlewares;

      devServerConfig.setupMiddlewares = (middlewares, devServer) => {
        if (originalSetupMiddlewares) {
          middlewares = originalSetupMiddlewares(middlewares, devServer);
        }
        setupHealthEndpoints(devServer, healthPluginInstance);
        return middlewares;
      };
    }

    return devServerConfig;
  },
};
