// Serialize and write snapshots off the Electron main thread. The parent
// alone renames them into place, so a delayed write cannot undo a newer flush.
const fs = require('fs');
const { parentPort } = require('worker_threads');

parentPort.on('message', ({ id, temporary, data }) => {
  try {
    fs.writeFileSync(temporary, JSON.stringify(data, null, 2));
    parentPort.postMessage({ id });
  } catch (err) {
    parentPort.postMessage({ id, error: err.message });
  }
});
