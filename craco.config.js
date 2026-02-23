// craco.config.js
module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      // public 폴더 참조, face-api 모델 등을 정상 로드 가능하게
      webpackConfig.resolve.fallback = {
        fs: false,
        path: require.resolve("path-browserify"),
        crypto: require.resolve("crypto-browserify"),
        stream: require.resolve("stream-browserify"),
        util: require.resolve("util/"),
      };
      return webpackConfig;
    },
  },
};
