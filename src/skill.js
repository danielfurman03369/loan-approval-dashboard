export function runSkill(message) {
  return `Skill received: ${message}`;
}

export function metadata() {
  return {
    name: 'Example Skill',
    version: '0.1.0',
    description: 'A starter skill that echoes input for a basic assistant workflow.',
  };
}
