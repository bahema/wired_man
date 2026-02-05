// Informational check: prints platform info and whether rollup can be resolved.
// Always exits 0 to avoid blocking builds on non-Linux platforms.
const path = require("path");

const platform = process.platform;
const arch = process.arch;

let rollupPath = null;
try {
  rollupPath = require.resolve("rollup", {
    paths: [path.join(__dirname, "..", "frontend")],
  });
} catch (err) {
  // Ignore resolution errors; this is informational only.
}

// eslint-disable-next-line no-console
console.log(
  `[rollup-check] platform=${platform} arch=${arch} rollup=${
    rollupPath || "not-found"
  }`
);
