const path = require('node:path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
  context: __dirname,
  target: 'web',
  devtool: false,
  entry: {
    base: './src/videocalls.js',
    vr: './src/videocallsvr.js',
    testacs: './src/testacs.js'
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle[name].js',
    clean: true
  },
  plugins: [new CopyPlugin({ patterns: [
    { from: 'src/*.html', to: '[name][ext]' },
    { from: 'src/*.css', to: '[name][ext]' },
    { from: 'src/*.svg', to: '[name][ext]' },
    { from: 'src/staticwebapp.config.json', to: 'staticwebapp.config.json' },
    { from: 'src/textures', to: 'textures' }
  ] })]
};
