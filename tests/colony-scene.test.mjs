import test from 'node:test';
import assert from 'node:assert/strict';
import { ColonyScene } from '../web/colony.js';
import { chamber } from '../web/colony-model.js';

function scene(reducedMotion = false) {
  return Object.assign(Object.create(ColonyScene.prototype), {
    ants: new Map(), settings: { reducedMotion }, time: 0,
    canvas: { setAttribute() {} }, labelsContainer: {},
  });
}
function state(status) {
  return { agents: [{ id: 'builder', role: 'builder', status }], tasks: [] };
}
function atDestination(ant, id) {
  assert.equal(ant.room, id);
  assert.equal(ant.destination, id);
  assert.equal(ant.path.length, 0);
  assert.ok(Math.abs(ant.x - chamber(id).x) <= 82);
  assert.ok(Math.abs(ant.y - chamber(id).y) <= 12);
}

test('reduced motion follows live task state without requiring an animation frame', () => {
  const view = scene(true);
  view.setState(state('running'));
  view.setState(state('done'));
  atDestination(view.ants.get('builder'), 'granary');
  view.setState(state('failed'));
  atDestination(view.ants.get('builder'), 'review');
});

test('enabling reduced motion settles a travelling ant in its current task chamber', () => {
  const view = scene();
  view.setState(state('running'));
  view.setState(state('done'));
  view.update(0.05);
  view.setSettings({ reducedMotion: true });
  atDestination(view.ants.get('builder'), 'granary');
  assert.equal(view.ants.get('builder').moving, false);
});

test('a task change inside a tunnel preserves the safe path to the next chamber', () => {
  const view = scene();
  view.setState(state('running'));
  view.setState(state('failed'));
  const ant = view.ants.get('builder');
  // Travel into the tunnel leading from the workshop to the queen.
  for (let i = 0; i < 100; i++) view.update(0.05);
  assert.ok(ant.path.length > 0);
  assert.ok(ant.x < 1200 && ant.x > 800, 'fixture is inside the upper tunnel');
  const nextWaypoint = { ...ant.path[0] };
  const previousPosition = { x: ant.x, y: ant.y };
  view.setState(state('done'));
  assert.deepEqual(ant.path[0], nextWaypoint, 'continue the current tunnel segment');
  assert.deepEqual({ x: ant.x, y: ant.y }, previousPosition, 'no teleport while animated');
  let reached = false;
  for (let i = 0; i < 1500; i++) {
    view.update(0.05);
    if (ant.room === 'granary' && ant.path.length === 0) { reached = true; break; }
  }
  assert.ok(reached, 'arrives at the latest destination');
  atDestination(ant, 'granary');
});

test('overlapping ants select the worker painted in front', () => {
  const view = scene();
  view.ants.set('front', { id: 'front', x: 300, y: 430 });
  view.ants.set('back', { id: 'back', x: 300, y: 420 });
  assert.equal(view.hit({ x: 300, y: 400 }).id, 'front');
});
