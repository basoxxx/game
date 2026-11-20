// Carte Baso — browser test of Burraco: same driver as tools/carte-scala-e2e.mjs, one round of Burraco
// (in two and in pairs) through the UI at the four viewports.
//   node tools/carte-burraco-e2e.mjs [baseUrl] [outDir]
process.env.GAMES ||= 'burraco';
await import('./carte-scala-e2e.mjs');
