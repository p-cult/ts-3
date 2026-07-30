'use strict';

/**
 * use-cases/ — application layer.
 * One action per file. No HTTP.
 */

const { createGetHealth } = require('./get-health');

/**
 * @param {{ config: object, data: object, runtime: object, log?: object }} deps
 */
function createUseCases(deps) {
  const { config, data, runtime, log } = deps;

  return {
    getHealth: createGetHealth({ config, data, runtime, log }),
  };
}

module.exports = { createUseCases };
