const { v4: uuidv4 } = require('uuid');

let tasks = [];

const getAll = () => [...tasks];

const findById = (id) => tasks.find((t) => t.id === id);

// FIX (Bug #2): exact status match. The original used `.includes()`, which is a
// substring match — e.g. ?status=in wrongly matched "in_progress", and ?status=o
// matched several statuses. Filtering by status should be an equality check.
const getByStatus = (status) => tasks.filter((t) => t.status === status);

// FIX (Bug #1): page is 1-indexed (README/route default to page=1), so the offset
// for page N is (N - 1) * limit. The original used `page * limit`, which skipped an
// entire page — page 1 returned records 10-19 instead of 0-9.
// Also guard against non-positive / non-integer page & limit so a bad query string
// can't produce a negative slice index (which would count from the end of the array).
const getPaginated = (page, limit) => {
  const safePage = Number.isInteger(page) && page > 0 ? page : 1;
  const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 10;
  const offset = (safePage - 1) * safeLimit;
  return tasks.slice(offset, offset + safeLimit);
};

const getStats = () => {
  const now = new Date();
  const counts = { todo: 0, in_progress: 0, done: 0 };
  let overdue = 0;

  tasks.forEach((t) => {
    if (counts[t.status] !== undefined) counts[t.status]++;
    if (t.dueDate && t.status !== 'done' && new Date(t.dueDate) < now) {
      overdue++;
    }
  });

  return { ...counts, overdue };
};

const create = ({ title, description = '', status = 'todo', priority = 'medium', dueDate = null }) => {
  const task = {
    id: uuidv4(),
    title,
    description,
    status,
    priority,
    dueDate,
    assignee: null, // added for the assign feature — keeps the shape consistent from creation
    completedAt: null,
    createdAt: new Date().toISOString(),
  };
  tasks.push(task);
  return task;
};

const update = (id, fields) => {
  const index = tasks.findIndex((t) => t.id === id);
  if (index === -1) return null;

  // FIX (Bug #4): the original spread `fields` verbatim, letting a client overwrite
  // server-managed fields via PUT — e.g. { "id": "..." } would change the task's id
  // (making it unreachable afterwards) or rewrite createdAt/completedAt. Strip those.
  const { id: _id, createdAt: _createdAt, completedAt: _completedAt, ...safeFields } = fields;

  const updated = { ...tasks[index], ...safeFields };
  tasks[index] = updated;
  return updated;
};

const remove = (id) => {
  const index = tasks.findIndex((t) => t.id === id);
  if (index === -1) return false;

  tasks.splice(index, 1);
  return true;
};

const completeTask = (id) => {
  const task = findById(id);
  if (!task) return null;

  // FIX (Bug #3): the original hard-coded `priority: 'medium'` here, silently wiping
  // out a task's real priority (a "high" task became "medium" just by completing it).
  // Completing a task should only change status + completedAt.
  const updated = {
    ...task,
    status: 'done',
    completedAt: new Date().toISOString(),
  };

  const index = tasks.findIndex((t) => t.id === id);
  tasks[index] = updated;
  return updated;
};

// New feature (Part C): assign a task to a user. Callers pass an already-validated,
// trimmed assignee string. Returns null when the task doesn't exist so the route can 404.
const assign = (id, assignee) => {
  const index = tasks.findIndex((t) => t.id === id);
  if (index === -1) return null;

  const updated = { ...tasks[index], assignee };
  tasks[index] = updated;
  return updated;
};

const _reset = () => {
  tasks = [];
};

module.exports = {
  getAll,
  findById,
  getByStatus,
  getPaginated,
  getStats,
  create,
  update,
  remove,
  completeTask,
  assign,
  _reset,
};
