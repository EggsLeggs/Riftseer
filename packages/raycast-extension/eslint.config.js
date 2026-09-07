// Flat config. ESLint 10 dropped `.eslintrc.*`, and `@raycast/eslint-config` v2
// exports a flat array to match, so there is nothing here but Raycast's own
// rules — js recommended, typescript-eslint recommended, the Raycast plugin and
// prettier last to switch off anything that fights the formatter.
module.exports = require("@raycast/eslint-config");
