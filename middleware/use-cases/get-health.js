'use strict';

/**
 * use-case: GetHealth — self-awareness report.
 * Gathers facts from config, runtime, data port; domain evaluates overall status.
 * No HTTP.
 */

const { evaluateOverall, summarizeConfig } = require('../domain/awareness');

function bannerMessage(config) {
  const mode = String(config.appMode || 'staging').toLowerCase();
  const writer = String(config.writerOfRecord || 'ts2').toLowerCase();
  if (mode === 'production' && writer === 'ts3') {
    return 'Production — ts-3 sole sheet reader/writer (ts-2 must stay offline)';
  }
  if (mode === 'production') {
    return 'Production — WRITER_OF_RECORD=' + writer + ' (ts-3 writes refused)';
  }
  if (config.stagingWrites) {
    return (
      'STAGING WRITES ON — ts-3 may write sheets (WRITER_OF_RECORD=' + writer + ')'
    );
  }
  return 'Staging — sheet writes off (STAGING_WRITES=false)';
}

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
        dataStatus = await Promise.race([
          data.ping(),
          new Promise((_, rej) =>
            setTimeout(() => rej(new Error('data ping timeout')), 2500)
          ),
        ]);
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
          bridgeStatus = await Promise.race([
            data.bridgeStatus(),
            new Promise((_, rej) =>
              setTimeout(() => rej(new Error('bridge ping timeout')), 2500)
            ),
          ]);
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

      const outbox =
        typeof data.outboxStats === 'function' ? data.outboxStats() : null;

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
        slice: '15',
        time: new Date().toISOString(),
        startedAt: rt.startedAt,
        mode: {
          env: config.env,
          appMode: config.appMode || 'staging',
          storeAdapter: config.storeAdapter || data.kind,
          liveBridge: !!config.useLiveBridge,
          projectsSource: data.projectsSource || 'fixture',
          stagingWrites: !!config.stagingWrites,
          writerOfRecord: config.writerOfRecord || 'ts2',
          queueMode: config.queueMode || 'off',
          writeBehind: !!outbox,
          isDev: !!config.isDev,
          isProd: !!config.isProd,
        },
        banner: {
          staging: (config.appMode || 'staging') === 'staging',
          stagingWrites: !!config.stagingWrites,
          writerOfRecord: config.writerOfRecord || 'ts2',
          queueMode: config.queueMode || 'off',
          message: bannerMessage(config),
        },
        config: {
          ok: configSummary.ok && rt.bootstrapOk !== false,
          bootstrapOk: rt.bootstrapOk,
          issues: configSummary.issues,
        },
        dependencies: {
          data: dataStatus,
          bridge: bridgeStatus,
          outbox: outbox || { pending: 0, dead: 0, synced: 0, oldestAgeSec: 0 },
          hydrate: {
            ok: config.useLiveBridge ? data.hydrateOk !== false : true,
            at: data.hydrateAt || null,
            reason: data.hydrateReason || null,
            required: String(config.appMode || '') === 'production' && !!config.useLiveBridge,
          },
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
