import { settings, checkPrerequisites } from './runtime.mjs';

try {
  checkPrerequisites(settings());
  console.log('Prerequisites checked.');
} catch (error) {
  console.error('Cannot start AccessDeck: ' + error.message);
  process.exitCode = 1;
}
