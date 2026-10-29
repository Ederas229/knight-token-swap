// Copy this file to config.local.mjs (git-ignored) and fill in your machine.
// Alternatively export E2E_FOUNDRY_DATA_PATH, E2E_WORLD and E2E_LOGIN_USER.
export default {
  // Foundry user data folder: the one holding Data/, Config/ and license.json.
  // For a portable install that is the install root. foundryconfig.json's
  // first dataPath entry is used when this is omitted.
  sourceDataPath: 'C:\\path\\to\\FoundryVTT',

  // A world running the Knight system. The suite copies it under test-data/ and
  // creates its own actors and tokens there; the original world is untouched.
  world: 'my-knight-world',

  // Which user to join as; must be a GM of that world.
  loginUser: 'Gamemaster',

  // Optional: folder containing Foundry's main.js/main.mjs server bootstrap.
  // Defaults to <sourceDataPath>/App/resources/app, which suits portable
  // installs; point it elsewhere for an unpacked FoundryVTT-Node download.
  // foundryNodePath: 'C:\\path\\to\\FoundryVTT-Node',
};
