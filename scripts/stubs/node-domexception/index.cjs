/*!
 * Same implementation as registry `node-domexception@1.0.0` (MIT), vendored so
 * npm does not warn about the deprecated package. Transitive deps (fetch-blob)
 * still need this export shape.
 */
if (!globalThis.DOMException) {
  try {
    const { MessageChannel } = require("worker_threads"),
      port = new MessageChannel().port1,
      ab = new ArrayBuffer();
    port.postMessage(ab, [ab, ab]);
  } catch (err) {
    err.constructor.name === "DOMException" &&
      (globalThis.DOMException = err.constructor);
  }
}

module.exports = globalThis.DOMException;
