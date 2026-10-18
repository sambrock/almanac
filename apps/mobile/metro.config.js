const path = require("node:path");

const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// lib0's React Native build of `lib0/webcrypto` imports isomorphic-webcrypto,
// which isn't installed. Yjs only needs `getRandomValues` from it, for client
// IDs, so serve that from expo-crypto instead.
config.resolver.resolveRequest = (context, moduleName, platform) =>
  moduleName === "lib0/webcrypto" && platform !== "web"
    ? { type: "sourceFile", filePath: path.resolve(__dirname, "src/lib/webcrypto.ts") }
    : context.resolveRequest(context, moduleName, platform);

module.exports = config;
