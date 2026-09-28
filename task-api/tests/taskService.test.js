const taskService = require('../src/services/taskService');

// Reset the in-memory store before every test so each one is independent.
beforeEach(() => taskService._reset());

// Small helper to seed N tasks with a predictable title (index 0..N-1).
const seed = (n, overrides = {}) =>
  Array.from({ length: n }, (_, i) =>
    taskService.create({ title: `task-${i}`, ...overrides })
  );

describe('create', () => {
  it('applies sensible defaults', () => {
    const t = taskService.create({ title: 'hello' });
    expect(t.id).toEqual(expect.any(String));
    expect(t.title).toBe('hello');
    expect(t.description).toBe('');
    expect(t.status).toBe('todo');
    expect(t.priority).toBe('medium');
    expect(t.dueDate).toBeNull();
    expect(t.assignee).toBeNull();
    expect(t.completedAt).toBeNull();
    expect(t.createdAt).toEqual(expect.any(String));
  });

  it('keeps values that are passed in', () => {
    const t = taskService.create({
      title: 'x',
      description: 'd',
      status: 'in_progress',
      priority: 'high',
      dueDate: '2020-01-01T00:00:00.000Z',
    });
    expect(t.status).toBe('in_progress');
    expect(t.priority).toBe('high');
    expect(t.dueDate).toBe('2020-01-01T00:00:00.000Z');
  });
});

describe('getAll / findById', () => {
  it('returns all created tasks', () => {
    seed(3);
    expect(taskService.getAll()).toHaveLength(3);
  });

  it('returns a copy, not the internal array (mutating it is harmless)', () => {
    seed(1);
    const list = taskService.getAll();
    list.push({ id: 'fake' });
    expect(taskService.getAll()).toHaveLength(1);
  });

  it('findById returns the matching task or undefined', () => {
    const [t] = seed(1);
    expect(taskService.findById(t.id)).toEqual(t);
    expect(taskService.findById('nope')).toBeUndefined();
  });
});

describe('getByStatus (Bug #2)', () => {
  it('matches by exact status only', () => {
    taskService.create({ title: 'a', status: 'todo' });
    taskService.create({ title: 'b', status: 'in_progress' });
    taskService.create({ title: 'c', status: 'done' });

    expect(taskService.getByStatus('todo')).toHaveLength(1);
    expect(taskService.getByStatus('in_progress')).toHaveLength(1);
    expect(taskService.getByStatus('done')).toHaveLength(1);
  });

  it('does NOT substring-match (the original .includes bug)', () => {
    taskService.create({ title: 'a', status: 'in_progress' });
    // "in" is a substring of "in_progress" but is not a valid status value.
    expect(taskService.getByStatus('in')).toHaveLength(0);
    expect(taskService.getByStatus('progress')).toHaveLength(0);
  });
});

describe('getPaginated (Bug #1)', () => {
  it('page 1 returns the FIRST page, not the second', () => {
    seed(25);
    const page1 = taskService.getPaginated(1, 10);
    expect(page1).toHaveLength(10);
    expect(page1[0].title).toBe('task-0'); // regression guard for the off-by-one
    expect(page1[9].title).toBe('task-9');
  });

  it('subsequent pages continue where the previous ended', () => {
    seed(25);
    expect(taskService.getPaginated(2, 10)[0].title).toBe('task-10');
    const last = taskService.getPaginated(3, 10);
    expect(last).toHaveLength(5);
    expect(last[0].title).toBe('task-20');
  });

  it('coerces non-positive / non-integer page & limit to safe defaults', () => {
    seed(5);
    // A negative page must not produce a negative slice index (edge case).
    expect(taskService.getPaginated(-1, 10)[0].title).toBe('task-0');
    expect(taskService.getPaginated(0, 10)[0].title).toBe('task-0');
  });
});

describe('getStats', () => {
  it('counts by status and flags overdue non-done tasks', () => {
    const past = '2000-01-01T00:00:00.000Z';
    const future = '2999-01-01T00:00:00.000Z';
    taskService.create({ title: 'a', status: 'todo', dueDate: past }); // overdue
    taskService.create({ title: 'b', status: 'in_progress' });
    taskService.create({ title: 'c', status: 'done', dueDate: past }); // done => not overdue
    taskService.create({ title: 'd', status: 'todo', dueDate: future }); // not overdue

    expect(taskService.getStats()).toEqual({
      todo: 2,
      in_progress: 1,
      done: 1,
      overdue: 1,
    });
  });
});

describe('update (Bug #4)', () => {
  it('merges provided fields', () => {
    const [t] = seed(1);
    const updated = taskService.update(t.id, { title: 'renamed', priority: 'high' });
    expect(updated.title).toBe('renamed');
    expect(updated.priority).toBe('high');
  });

  it('ignores attempts to overwrite id / createdAt / completedAt', () => {
    const [t] = seed(1);
    const updated = taskService.update(t.id, {
      id: 'hacked',
      createdAt: 'tampered',
      completedAt: 'tampered',
      title: 'ok',
    });
    expect(updated.id).toBe(t.id);
    expect(updated.createdAt).toBe(t.createdAt);
    expect(updated.completedAt).toBeNull();
    // still reachable by its original id
    expect(taskService.findById(t.id)).toBeTruthy();
  });

  it('returns null for a missing id', () => {
    expect(taskService.update('nope', { title: 'x' })).toBeNull();
  });
});

describe('remove', () => {
  it('deletes an existing task and reports success', () => {
    const [t] = seed(1);
    expect(taskService.remove(t.id)).toBe(true);
    expect(taskService.getAll()).toHaveLength(0);
  });

  it('returns false for a missing id', () => {
    expect(taskService.remove('nope')).toBe(false);
  });
});

describe('completeTask (Bug #3)', () => {
  it('sets status/completedAt but PRESERVES the original priority', () => {
    const t = taskService.create({ title: 'x', priority: 'high' });
    const done = taskService.completeTask(t.id);
    expect(done.status).toBe('done');
    expect(done.completedAt).toEqual(expect.any(String));
    expect(done.priority).toBe('high'); // was being clobbered to 'medium'
  });

  it('returns null for a missing id', () => {
    expect(taskService.completeTask('nope')).toBeNull();
  });
});

describe('assign (feature)', () => {
  it('stores the assignee on the task', () => {
    const [t] = seed(1);
    const updated = taskService.assign(t.id, 'Alice');
    expect(updated.assignee).toBe('Alice');
    expect(taskService.findById(t.id).assignee).toBe('Alice');
  });

  it('allows reassignment', () => {
    const [t] = seed(1);
    taskService.assign(t.id, 'Alice');
    expect(taskService.assign(t.id, 'Bob').assignee).toBe('Bob');
  });

  it('returns null for a missing id', () => {
    expect(taskService.assign('nope', 'Alice')).toBeNull();
  });
});
