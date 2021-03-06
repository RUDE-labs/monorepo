const path = require('path');

const baseConfig = {
  entry: './src/index.ts',
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/
      }
    ]
  },
  resolve: {
    extensions: ['.ts'],
    mainFields: ['unpkg', 'browser', 'module', 'main']
  }
};

const cdnConfig = {
  ...baseConfig,
  target: 'web',
  mode: 'production',
  output: {
    filename: 'channel-provider.min.js',
    libraryTarget: 'window',
    path: path.resolve(__dirname, 'dist')
  }
};

const cdnDebugConfig = {
  ...baseConfig,
  ...cdnConfig,
  mode: 'development',
  devtool: 'inline-source-map',
  output: {
    ...cdnConfig.output,
    filename: 'channel-provider.js'
  }
};

module.exports = [cdnDebugConfig];
