export function parseParticipants(input: string): {name: string; role: string}[] {
  return input.split(/[,;\n]+/).flatMap(line =>
    // With explicit roles, only split before another name with its own role.
    line.split(/\s+y\s+(?=(?:(?!\s+y\s+)[^:;\n,])+(?::|\s+-\s+))/i).flatMap(entry => {
      const [names, ...roles] = entry.split(/\s*:\s*|\s+-\s+/);
      const role = roles.join(' - ').trim() || 'Integrante';
      return names.split(/\s+y\s+/i).map(name => ({name: name.trim(), role})).filter(member => member.name);
    })
  );
}
