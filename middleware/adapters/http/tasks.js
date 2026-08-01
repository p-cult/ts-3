'use strict';

/**
 * HTTP adapter — tasks + stages + review (thin).
 */

function register(router) {
  router.get('/api/tasks', async (ctx) => {
    const nested = ctx.query && ctx.query.nested === '1';
    const result = await ctx.useCases.listTasks.execute({
      actor: ctx.actor,
      nested,
      query: ctx.query || {},
    });
    ctx.sendJson(200, result);
  });

  router.get('/api/tasks/:id', async (ctx) => {
    const result = await ctx.useCases.getTask.execute({
      actor: ctx.actor,
      id: ctx.params.id,
    });
    ctx.sendJson(200, result);
  });

  router.post('/api/tasks', async (ctx) => {
    const body = await ctx.readJson();
    const result = await ctx.useCases.createTask.execute({
      actor: ctx.actor,
      body,
    });
    ctx.sendJson(result && result.queued ? 202 : 201, result);
  });

  router.post('/api/tasks/:id/make-task', async (ctx) => {
    const result = await ctx.useCases.makeTask.execute({
      actor: ctx.actor,
      id: ctx.params.id,
    });
    ctx.sendJson(200, result);
  });

  router.patch('/api/tasks/:id', async (ctx) => {
    const body = await ctx.readJson();
    const result = await ctx.useCases.updateTask.execute({
      actor: ctx.actor,
      id: ctx.params.id,
      body,
    });
    ctx.sendJson(200, result);
  });

  router.patch('/api/tasks/:ref/reassign', async (ctx) => {
    const body = await ctx.readJson();
    const result = await ctx.useCases.reassignTask.execute({
      actor: ctx.actor,
      id: ctx.params.ref,
      assigneeUsername: body && body.assigneeUsername,
    });
    ctx.sendJson(200, result);
  });

  router.delete('/api/tasks/:id', async (ctx) => {
    const result = await ctx.useCases.deleteTask.execute({
      actor: ctx.actor,
      id: ctx.params.id,
    });
    ctx.sendJson(200, result);
  });

  router.patch('/api/tasks/:id/stages', async (ctx) => {
    const body = await ctx.readJson();
    const result = await ctx.useCases.setStages.execute({
      actor: ctx.actor,
      id: ctx.params.id,
      body,
    });
    ctx.sendJson(200, result);
  });

  router.post('/api/tasks/:id/review/submit', async (ctx) => {
    const body = await ctx.readJson().catch(() => ({}));
    const result = await ctx.useCases.reviewSubmit.execute({
      actor: ctx.actor,
      id: ctx.params.id,
      link: body && body.link,
      notes: body && body.notes,
      ratings: body && body.ratings,
    });
    ctx.sendJson(200, result);
  });

  router.post('/api/tasks/:id/review/feedback', async (ctx) => {
    const body = await ctx.readJson();
    const result = await ctx.useCases.reviewFeedback.execute({
      actor: ctx.actor,
      id: ctx.params.id,
      notes: body.notes,
      ratings: body && body.ratings,
    });
    ctx.sendJson(200, result);
  });

  router.post('/api/tasks/:id/review/rework', async (ctx) => {
    const body = await ctx.readJson();
    const result = await ctx.useCases.reviewRework.execute({
      actor: ctx.actor,
      id: ctx.params.id,
      notes: body.notes,
      ratings: body && body.ratings,
    });
    ctx.sendJson(200, result);
  });

  router.post('/api/tasks/:id/review/approve', async (ctx) => {
    const body = await ctx.readJson().catch(() => ({}));
    const result = await ctx.useCases.reviewApprove.execute({
      actor: ctx.actor,
      id: ctx.params.id,
      notes: body && body.notes,
      ratings: body && body.ratings,
    });
    ctx.sendJson(200, result);
  });
}

module.exports = { register };
