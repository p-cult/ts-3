'use strict';

/**
 * use-case: GetHealth — self-awareness report.
 * Gathers facts from config, runtime, data port; domain evaluates overall status.
 * No HTTP.
 */

const { evaluateOverall, summarizeConfig } = require('../domain/awareness');

/**
 * @param {{
 *   config: object,
 *   data: { ping: Function, kind?: string, bridgeStatus?: Function },
 *   runtime: { snapshot: Function },
 *   log?: object,
 * }} deps
 */
function createGetHealth(deps) {
  const { config, data, runtime } = deps;

  return {
    /**
     * @returns {Promise<object>}
     */
    async execute() {
      const rt = runtime.snapshot();

      let dataStatus = { ok: false, kind: data.kind || 'unknown' };
      try {
        dataStatus = await data.ping();
      } catch (err) {
        dataStatus = {
          ok: false,
          kind: data.kind || 'unknown',
          error: String(err && err.message ? err.message : err),
        };
      }

      let bridgeStatus = {
        ok: true,
        state: 'disabled',
        message: 'live bridge off',
      };
      if (typeof data.bridgeStatus === 'function') {
        try {
          bridgeStatus = await data.bridgeStatus();
        } catch (err) {
          bridgeStatus = {
            ok: false,
            state: 'error',
            error: String(err && err.message ? err.message : err),
          };
        }
      }

      const configIssues = (rt.notices || [])
        .filter(Boolean)
        .map((message) => ({
          severity: 'warn',
          code: 'notice',
          message,
        }));

      // Re-surface bootstrap blockers as config issues for the report
      for (const b of rt.blockers || []) {
        configIssues.push({
          severity: 'error',
          code: 'blocker',
          message: b.message,
          hint: b.hint,
        });
      }

      // Mode / config completeness (live view)
      if (config.useLiveBridge && (!config.bridgeUrl || !config.bridgeSecret)) {
        configIssues.push({
          severity: 'error',
          code: 'bridge_config',
          message: 'live bridge enabled but URL/secret incomplete',
          hint: 'Set BRIDGE_URL and BRIDGE_SECRET or USE_LIVE_BRIDGE=false',
        });
      }
      if (config.isProd && !config.sessionSecret) {
        configIssues.push({
          severity: 'warn',
          code: 'session_secret',
          message: 'SESSION_SECRET empty in production',
          hint: 'Set before enabling login',
        });
      }

      const configSummary = summarizeConfig(configIssues);
      const dependencyOk = dataStatus.ok !== false && bridgeStatus.ok !== false;

      const overall = evaluateOverall({
        configIssues,
        dependencyOk,
        blockers: (rt.blockers || []).map((b) => b.message),
        healedCount: (rt.heals || []).length,
      });

      return {
        ok: overall.ok,
        status: overall.status,
        app: config.appName,
        version: config.appVersion,
        foundation: true,
        slice: '07',
        time: new Date().toISOString(),
        startedAt: rt.startedAt,
        mode: {
          env: config.env,
          appMode: config.appMode || 'staging',
          storeAdapter: config.storeAdapter || data.kind,
          liveBridge: !!config.useLiveBridge,
          stagingWrites: !!config.stagingWrites,
          writerOfRecord: config.writerOfRecord || 'ts2',
          queueMode: config.queueMode || 'off',
          isDev: !!config.isDev,
          isProd: !!config.isProd,
        },
        banner: {
          staging: (config.appMode || 'staging') === 'staging',
          stagingWrites: !!config.stagingWrites,
          writerOfRecord: config.writerOfRecord || 'ts2',
          queueMode: config.queueMode || 'off',
          message: !!config.stagingWrites
            ? 'STAGING WRITES ON — ts-3 may write sheets (WRITER_OF_RECORD=' +
              (config.writerOfRecord || 'ts2') +
              ')'
            : 'Staging — sheet writes off (STAGING_WRITES=false)',
        },
        config: {
          ok: configSummary.ok && rt.bootstrapOk !== false,
          bootstrapOk: rt.bootstrapOk,
          issues: configSummary.issues,
        },
        dependencies: {
          data: dataStatus,
          bridge: bridgeStatus,
        },
        selfHealing: {
          enabled: true,
          actions: rt.heals || [],
        },
        uptimeSeconds:
          rt.startedAt
            ? Math.max(0, Math.floor((Date.now() - Date.parse(rt.startedAt)) / 1000))
            : null,
      };
    },
  };
}

module.exports = { createGetHealth };
