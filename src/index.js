import { runSkill } from './skill.js';

const input = process.argv.slice(2).join(' ');

if (!input) {
  console.log('Usage: npm start -- "<message>"');
  process.exit(1);
}

const output = runSkill(input);
console.log(output);
