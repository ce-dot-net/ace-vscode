//@ts-check
'use strict';

const path = require('path');
const webpack = require('webpack');

/** @type {import('webpack').Configuration} */
const config = {
  target: 'node',
  mode: 'none',

  entry: './src/extension.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'extension.js',
    libraryTarget: 'commonjs2'
  },
  externals: {
    vscode: 'commonjs vscode'
  },
  plugins: [
    // Replace native/optional modules with stubs
    // The SDK gracefully handles missing optional dependencies
    new webpack.NormalModuleReplacementPlugin(
      /better-sqlite3/,
      path.resolve(__dirname, 'src/stubs/better-sqlite3-stub.js')
    ),
    new webpack.NormalModuleReplacementPlugin(
      /^linguist-js$/,
      path.resolve(__dirname, 'src/stubs/linguist-js-stub.js')
    ),
    new webpack.NormalModuleReplacementPlugin(
      /^skott$/,
      path.resolve(__dirname, 'src/stubs/skott-stub.js')
    ),
    // Stub @ace-sdk/core version module - it uses readFileSync with __dirname
    // which gets baked as the CI build path in the webpack bundle
    new webpack.NormalModuleReplacementPlugin(
      /@ace-sdk\/core\/dist\/version/,
      path.resolve(__dirname, 'src/stubs/ace-version-stub.js')
    )
  ],
  resolve: {
    extensions: ['.ts', '.js'],
    // Handle ESM packages
    extensionAlias: {
      '.js': ['.ts', '.js']
    }
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader'
          }
        ]
      },
      {
        // Process ESM .js files from @ace-sdk/core
        test: /\.m?js$/,
        include: /node_modules\/@ace-sdk/,
        type: 'javascript/auto',
        resolve: {
          fullySpecified: false
        }
      }
    ]
  },
  devtool: 'nosources-source-map',
  infrastructureLogging: {
    level: 'log'
  },
  // Experiments for ESM support
  experiments: {
    outputModule: false
  }
};

module.exports = config;
