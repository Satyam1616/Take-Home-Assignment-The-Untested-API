const request = require('supertest');
const app = require('../src/app');
const taskService = require('../src/services/taskService');

beforeEach(() => taskService._reset());

// Helper: create a task through the API and return its body.
const createTask = (body = { title: 'sample' }) =>
  request(app).post('/tasks').send(body).then((r) => r.body);

describe('POST /tasks', () => {
  it('creates a task and returns 201 with the created resource', async () => {
    const res = await request(app).post('/tasks').send({ title: 'Write tests', priority: 'high' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ title: 'Write tests', priority: 'high', status: 'todo' });
    expect(res.body.id).toEqual(expect.any(String));
  });

  it('rejects a missing title with 400', async () => {
    const res = await request(app).post('/tasks').send({ priority: 'high' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/title/i);
  });

  it('rejects an invalid status with 400', async () => {
    const res = await request(app).post('/tasks').send({ title: 'x', status: 'nope' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/status/i);
  });
});

describe('GET /tasks', () => {
  it('lists all tasks', async () => {
    await createTask({ title: 'a' });
    await createTask({ title: 'b' });
    const res = await request(app).get('/tasks');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it('filters by exact status', async () => {
    await createTask({ title: 'a', status: 'todo' });
    await createTask({ title: 'b', status: 'in_progress' });
    const res = await request(app).get('/tasks?status=in_progress');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].status).toBe('in_progress');
  });

  it('paginates starting at page 1 (regression: off-by-one)', async () => {
    for (let i = 0; i < 15; i++) await createTask({ title: `t-${i}` });
    const res = await request(app).get('/tasks?page=1&limit=10');
    expect(res.body).toHaveLength(10);
    expect(res.body[0].title).toBe('t-0');
  });
});

describe('GET /tasks/stats', () => {
  it('returns counts and overdue', async () => {
    await createTask({ title: 'a', status: 'todo', dueDate: '2000-01-01T00:00:00.000Z' });
    await createTask({ title: 'b', status: 'done' });
    const res = await request(app).get('/tasks/stats');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ todo: 1, in_progress: 0, done: 1, overdue: 1 });
  });
});

describe('PUT /tasks/:id', () => {
  it('updates an existing task', async () => {
    const t = await createTask({ title: 'old' });
    const res = await request(app).put(`/tasks/${t.id}`).send({ title: 'new' });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('new');
  });

  it('returns 404 for a missing task', async () => {
    const res = await request(app).put('/tasks/does-not-exist').send({ title: 'x' });
    expect(res.status).toBe(404);
  });

  it('rejects an invalid body with 400', async () => {
    const t = await createTask({ title: 'old' });
    const res = await request(app).put(`/tasks/${t.id}`).send({ title: '' });
    expect(res.status).toBe(400);
  });
});

describe('DELETE /tasks/:id', () => {
  it('deletes and returns 204', async () => {
    const t = await createTask();
    const res = await request(app).delete(`/tasks/${t.id}`);
    expect(res.status).toBe(204);
    expect(res.body).toEqual({});
  });

  it('returns 404 for a missing task', async () => {
    const res = await request(app).delete('/tasks/nope');
    expect(res.status).toBe(404);
  });
});

describe('PATCH /tasks/:id/complete', () => {
  it('marks a task done and keeps its priority', async () => {
    const t = await createTask({ title: 'x', priority: 'high' });
    const res = await request(app).patch(`/tasks/${t.id}/complete`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('done');
    expect(res.body.priority).toBe('high');
  });

  it('returns 404 for a missing task', async () => {
    const res = await request(app).patch('/tasks/nope/complete');
    expect(res.status).toBe(404);
  });
});

describe('PATCH /tasks/:id/assign (feature)', () => {
  it('assigns a user and returns the updated task', async () => {
    const t = await createTask();
    const res = await request(app).patch(`/tasks/${t.id}/assign`).send({ assignee: 'Alice' });
    expect(res.status).toBe(200);
    expect(res.body.assignee).toBe('Alice');
  });

  it('trims surrounding whitespace', async () => {
    const t = await createTask();
    const res = await request(app).patch(`/tasks/${t.id}/assign`).send({ assignee: '  Bob  ' });
    expect(res.body.assignee).toBe('Bob');
  });

  it('allows reassignment of an already-assigned task', async () => {
    const t = await createTask();
    await request(app).patch(`/tasks/${t.id}/assign`).send({ assignee: 'Alice' });
    const res = await request(app).patch(`/tasks/${t.id}/assign`).send({ assignee: 'Bob' });
    expect(res.status).toBe(200);
    expect(res.body.assignee).toBe('Bob');
  });

  it('returns 400 for an empty / whitespace-only assignee', async () => {
    const t = await createTask();
    const res = await request(app).patch(`/tasks/${t.id}/assign`).send({ assignee: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/assignee/i);
  });

  it('returns 400 for a missing or non-string assignee', async () => {
    const t = await createTask();
    expect((await request(app).patch(`/tasks/${t.id}/assign`).send({})).status).toBe(400);
    expect((await request(app).patch(`/tasks/${t.id}/assign`).send({ assignee: 42 })).status).toBe(400);
  });

  it('returns 404 when the task does not exist', async () => {
    const res = await request(app).patch('/tasks/nope/assign').send({ assignee: 'Alice' });
    expect(res.status).toBe(404);
  });

  it('validates the body before looking up the task (400 beats 404)', async () => {
    const res = await request(app).patch('/tasks/nope/assign').send({ assignee: '' });
    expect(res.status).toBe(400);
  });
});
