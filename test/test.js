import assert from 'assert';
import { runSkill } from '../src/skill.js';

assert.strictEqual(runSkill('Hello'), 'Skill received: Hello');
console.log('Test passed.');
