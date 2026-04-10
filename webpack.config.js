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
    // @ace-sdk/core@2.14.0+ ships CJS build — no more ESM workarounds needed
    // Only stub native optional deps that can't be bundled
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
    )
  ],
  resolve: {
    extensions: ['.ts', '.js']
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
      }
    ]
  },
  devtool: 'nosources-source-map',
  infrastructureLogging: {
    level: 'log'
  },
  experiments: {
    outputModule: false
  }
};

module.exports = config;
